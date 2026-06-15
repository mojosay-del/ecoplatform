import type { Logger } from "@nestjs/common";
import { CompanyStatus, Prisma } from "@prisma/client";
import type { FilesService } from "../files/files.service";
import type { PrismaService } from "../prisma/prisma.service";

// Регистрационный challenge хранит хэш пароля + ПДн до подтверждения кода.
// Через сутки после истечения TTL строка больше не нужна и удаляется физически.
const EMAIL_CHALLENGE_RETENTION_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_DELETION_GRACE_MS = 30 * 24 * 60 * 60 * 1000;
const ACCOUNT_DELETION_BATCH_SIZE = 500;
const ORPHAN_FILE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const ORPHAN_FILE_BATCH_SIZE = 100;
const SESSION_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const IDEMPOTENCY_KEY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const NOTIFICATION_DELIVERY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ADMIN_ACTION_LOG_RETENTION_MS = 730 * 24 * 60 * 60 * 1000;
const IN_APP_NOTIFICATION_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

type CleanupLogger = Pick<Logger, "log">;

type AccountDeletionCandidate = {
  id: string;
  companyId: string | null;
};

export type AccountDeletionCleanupResult = {
  deletedUsers: number;
  deletedCompanies: number;
};

export async function cleanupDeletedAccountsInTransaction(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<AccountDeletionCleanupResult> {
  const cutoff = new Date(now.getTime() - ACCOUNT_DELETION_GRACE_MS);
  // Row lock закрывает гонку с одновременной отменой удаления аккаунта.
  const candidates = await tx.$queryRaw<AccountDeletionCandidate[]>`
    SELECT id, "companyId"
    FROM "User"
    WHERE "deletionRequestedAt" < ${cutoff}
    ORDER BY "deletionRequestedAt" ASC
    LIMIT ${ACCOUNT_DELETION_BATCH_SIZE}
    FOR UPDATE
  `;

  if (candidates.length === 0) {
    return { deletedUsers: 0, deletedCompanies: 0 };
  }

  const userIds = candidates.map((user) => user.id);
  const companyIds = Array.from(new Set(candidates.map((user) => user.companyId).filter(Boolean))) as string[];

  await tx.fileAsset.deleteMany({
    where: {
      uploadedById: { in: userIds },
      references: { none: {} },
    },
  });

  const deletedUsers = await tx.user.deleteMany({ where: { id: { in: userIds } } });
  let deletedCompanies = 0;

  for (const companyId of companyIds) {
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: {
        status: true,
        statusBeforeDeletion: true,
        factualAddressId: true,
        structuredLegalAddressId: true,
      },
    });
    const remainingUsers = await tx.user.count({ where: { companyId } });
    const remainingPendingUsers = await tx.user.count({
      where: { companyId, deletionRequestedAt: { not: null } },
    });

    if (!company) continue;

    if (remainingUsers === 0) {
      const detachedAddressIds = [company.factualAddressId, company.structuredLegalAddressId].filter(
        (id): id is string => Boolean(id),
      );
      const deleted = await tx.company.deleteMany({
        where: { id: companyId, status: CompanyStatus.pending_deletion },
      });
      if (deleted.count > 0 && detachedAddressIds.length > 0) {
        await tx.address.deleteMany({ where: { id: { in: detachedAddressIds } } });
      }
      deletedCompanies += deleted.count;
      continue;
    }

    if (company.status === CompanyStatus.pending_deletion && remainingPendingUsers === 0) {
      await tx.company.update({
        where: { id: companyId },
        data: {
          status: company.statusBeforeDeletion ?? CompanyStatus.demo,
          statusBeforeDeletion: null,
        },
      });
    }
  }

  return { deletedUsers: deletedUsers.count, deletedCompanies };
}

export async function cleanupOrphanFiles(
  prisma: PrismaService,
  files: FilesService,
  logger: CleanupLogger,
  now = new Date(),
): Promise<{ scanned: number; deleted: number }> {
  const cutoff = new Date(now.getTime() - ORPHAN_FILE_GRACE_MS);
  const candidates = await prisma.fileAsset.findMany({
    where: { createdAt: { lt: cutoff }, references: { none: {} } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: ORPHAN_FILE_BATCH_SIZE,
  });

  if (candidates.length === 0) {
    return { scanned: 0, deleted: 0 };
  }

  const deleted = await files.deleteIfUnreferenced(candidates.map((candidate) => candidate.id));
  logger.log(`Orphan file cleanup: scanned ${candidates.length}, deleted ${deleted}`);
  return { scanned: candidates.length, deleted };
}

export async function cleanupExpiredEmailChallenges(
  prisma: PrismaService,
  logger: CleanupLogger,
  now = new Date(),
): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - EMAIL_CHALLENGE_RETENTION_MS);
  const { count } = await prisma.emailVerificationChallenge.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });

  if (count > 0) {
    logger.log(`Email challenge cleanup: deleted ${count} expired/verified challenges`);
  }
  return { deleted: count };
}

export async function cleanupExpiredSessions(
  prisma: PrismaService,
  logger: CleanupLogger,
  now = new Date(),
): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - SESSION_RETENTION_MS);
  const { count } = await prisma.session.deleteMany({
    where: { expiresAt: { lt: cutoff } },
  });
  if (count > 0) {
    logger.log(`Session cleanup: deleted ${count} expired sessions`);
  }
  return { deleted: count };
}

export async function cleanupStaleIdempotencyKeys(
  prisma: PrismaService,
  logger: CleanupLogger,
  now = new Date(),
): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_KEY_RETENTION_MS);
  const { count } = await prisma.idempotencyKey.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (count > 0) {
    logger.log(`Idempotency key cleanup: deleted ${count} stale keys`);
  }
  return { deleted: count };
}

export async function cleanupStaleNotificationDeliveries(
  prisma: PrismaService,
  logger: CleanupLogger,
  now = new Date(),
): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - NOTIFICATION_DELIVERY_RETENTION_MS);
  const { count } = await prisma.notificationDelivery.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (count > 0) {
    logger.log(`Notification delivery cleanup: deleted ${count} old deliveries`);
  }
  return { deleted: count };
}

export async function cleanupStaleInAppNotifications(
  prisma: PrismaService,
  logger: CleanupLogger,
  now = new Date(),
): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - IN_APP_NOTIFICATION_RETENTION_MS);
  const { count } = await prisma.inAppNotification.deleteMany({
    where: {
      OR: [{ readAt: { lt: cutoff } }, { archivedAt: { lt: cutoff } }],
    },
  });
  if (count > 0) {
    logger.log(`In-app notification cleanup: deleted ${count} old read/archived notifications`);
  }
  return { deleted: count };
}

export async function cleanupStaleAdminActionLogs(
  prisma: PrismaService,
  logger: CleanupLogger,
  now = new Date(),
): Promise<{ deleted: number }> {
  const cutoff = new Date(now.getTime() - ADMIN_ACTION_LOG_RETENTION_MS);
  const { count } = await prisma.adminActionLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  if (count > 0) {
    logger.log(`Admin action log cleanup: deleted ${count} old entries`);
  }
  return { deleted: count };
}

export async function cleanupOrphanAddresses(
  prisma: PrismaService,
  logger: CleanupLogger,
): Promise<{ deleted: number }> {
  const { count } = await prisma.address.deleteMany({
    where: {
      companyAsFactual: { is: null },
      companyAsLegal: { is: null },
      marketplaceListing: { is: null },
    },
  });
  if (count > 0) {
    logger.log(`Address cleanup: deleted ${count} orphan addresses`);
  }
  return { deleted: count };
}
