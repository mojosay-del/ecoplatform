import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { CompanyStatus, ModerationCaseStatus, SanctionType, UserStatus, type Prisma } from "@prisma/client";
import type { z } from "zod";
import type { AdminActionLogService } from "../common/admin-action-log.service";
import type { RequestUser } from "../common/request-user";
import { swallowAndLog } from "../common/silent-catch";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { SessionCacheService } from "../redis/session-cache.service";
import { notifyAdminSanction, notifySanctionLift } from "./moderation-notify.helpers";
import type { adminSanctionInputSchema, sanctionLiftInputSchema } from "./moderation.schemas";

type AdminSanctionInput = z.infer<typeof adminSanctionInputSchema>;
type SanctionLiftInput = z.infer<typeof sanctionLiftInputSchema>;

export type ModerationSanctionDeps = {
  prisma: PrismaService;
  auditLog: AdminActionLogService;
  notifications: NotificationsService;
  sessionCache: SessionCacheService;
};

const moderationSanctionCaseInclude = {
  complaints: { orderBy: { createdAt: "asc" } },
  decisions: { orderBy: { createdAt: "asc" } },
  sanctions: { orderBy: { appliedAt: "asc" } },
} satisfies Prisma.ModerationCaseInclude;

export type ModerationSanctionCaseWithRelations = Prisma.ModerationCaseGetPayload<{
  include: typeof moderationSanctionCaseInclude;
}>;

export async function applyAdminSanction(
  deps: ModerationSanctionDeps,
  id: string,
  input: AdminSanctionInput,
  user: RequestUser,
): Promise<ModerationSanctionCaseWithRelations> {
  if (!isAdmin(user)) {
    throw new ForbiddenException("Применить эту санкцию может только администратор.");
  }

  const found = await deps.prisma.moderationCase.findUnique({
    where: { id },
    include: moderationSanctionCaseInclude,
  });
  if (!found) {
    throw new NotFoundException("Кейс модерации не найден.");
  }
  if (found.status !== ModerationCaseStatus.escalated) {
    throw new BadRequestException("Админ-санкция применяется только по эскалированному кейсу.");
  }

  if (input.type === "module_restriction" || input.type === "user_block") {
    if (!found.entityAuthorId) {
      throw new BadRequestException("У сущности нет автора-пользователя для применения санкции.");
    }
  }
  if (input.type === "company_block" && !found.entityCompanyId) {
    throw new BadRequestException("У сущности нет компании для блокировки.");
  }

  const result = await deps.prisma.$transaction(async (tx) => {
    const sanctionType =
      input.type === "user_block"
        ? SanctionType.user_block
        : input.type === "company_block"
          ? SanctionType.company_block
          : SanctionType.module_restriction;

    const { targetType, targetId } = resolveSanctionTarget(input.type, found);
    const auditBefore: Record<string, unknown> = input.type === "module_restriction" ? { restriction: null } : {};
    const auditAfter: Record<string, unknown> = {};

    const baseParameters: Prisma.InputJsonValue = {
      reasonCode: input.reasonCode,
      ...(input.comment ? { comment: input.comment } : {}),
    };

    if (input.type === "user_block") {
      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: { email: true, status: true },
      });
      if (!target) {
        throw new NotFoundException("Пользователь не найден.");
      }
      assertUserBlockAllowed(targetId, target, user);
      auditBefore.status = target.status;
      await tx.user.update({ where: { id: targetId }, data: { status: UserStatus.blocked } });
      auditAfter.status = UserStatus.blocked;
      await tx.session.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else if (input.type === "company_block") {
      const target = await tx.company.findUnique({
        where: { id: targetId },
        select: { status: true },
      });
      if (!target) {
        throw new NotFoundException("Компания не найдена.");
      }
      if (target.status === CompanyStatus.blocked) {
        throw new BadRequestException("Компания уже заблокирована.");
      }
      auditBefore.status = target.status;
      await tx.company.update({ where: { id: targetId }, data: { status: CompanyStatus.blocked } });
      auditAfter.status = CompanyStatus.blocked;
      await tx.session.updateMany({
        where: { user: { companyId: targetId }, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    const sanction = await tx.sanction.create({
      data: {
        caseId: found.id,
        type: sanctionType,
        targetType,
        targetId,
        appliedById: user.id,
        parameters:
          input.type === "module_restriction"
            ? {
                ...baseParameters,
                moduleCode: input.moduleCode!,
                durationDays: input.durationDays!,
              }
            : { ...baseParameters, previousStatus: auditBefore.status as string },
      },
    });

    if (input.type === "module_restriction") {
      const expiresAt = new Date(Date.now() + input.durationDays! * 24 * 60 * 60 * 1000);
      const restriction = await tx.userModuleRestriction.create({
        data: {
          userId: found.entityAuthorId!,
          companyId: found.entityCompanyId,
          moduleCode: input.moduleCode!,
          sanctionId: sanction.id,
          reasonCode: input.reasonCode,
          comment: input.comment,
          appliedById: user.id,
          expiresAt,
        },
      });
      auditAfter.restriction = {
        moduleCode: restriction.moduleCode,
        expiresAt: restriction.expiresAt.toISOString(),
      };
    }

    const updatedCase = await tx.moderationCase.update({
      where: { id: found.id },
      data: {
        status: ModerationCaseStatus.closed_by_admin,
        closedAt: new Date(),
        lockedById: null,
        lockedUntil: null,
      },
      include: moderationSanctionCaseInclude,
    });

    return { sanction, updatedCase, auditBefore, auditAfter };
  });

  await invalidateCacheForSanction(deps, result.sanction.type, result.sanction.targetId);

  await deps.auditLog.recordChange({
    actorId: user.id,
    action: `moderation.admin_sanction.${input.type}`,
    entityType: "ModerationCase",
    entityId: found.id,
    comment: input.comment,
    before: result.auditBefore,
    after: result.auditAfter,
    extra: {
      sanctionId: result.sanction.id,
      reasonCode: input.reasonCode,
      targetType: result.sanction.targetType,
      targetId: result.sanction.targetId,
      ...(input.type === "module_restriction"
        ? { moduleCode: input.moduleCode, durationDays: input.durationDays }
        : {}),
    },
  });

  await notifyAdminSanction(deps, found, result.sanction, input).catch(
    swallowAndLog("moderation.sanction.notify", { sanctionId: result.sanction.id }),
  );

  return result.updatedCase;
}

export async function liftSanction(
  deps: ModerationSanctionDeps,
  id: string,
  input: SanctionLiftInput,
  user: RequestUser,
) {
  if (!isAdmin(user)) {
    throw new ForbiddenException("Снять санкцию может только администратор.");
  }

  const sanction = await deps.prisma.sanction.findUnique({ where: { id } });
  if (!sanction) {
    throw new NotFoundException("Санкция не найдена.");
  }
  if (sanction.liftedAt) {
    throw new BadRequestException("Санкция уже снята.");
  }
  if (sanction.type === SanctionType.warning || sanction.type === SanctionType.content_removal) {
    throw new BadRequestException("Эта санкция не снимается через данный эндпойнт.");
  }

  await deps.prisma.$transaction(async (tx) => {
    await tx.sanction.update({
      where: { id },
      data: { liftedAt: new Date(), liftedById: user.id },
    });

    if (sanction.type === SanctionType.user_block) {
      const otherActiveBlockExists = await hasOtherActiveBlock(tx, sanction);
      const previousStatus = previousUserStatus(sanction.parameters);
      if (!otherActiveBlockExists && previousStatus !== UserStatus.blocked) {
        await tx.user.update({ where: { id: sanction.targetId }, data: { status: previousStatus } });
      }
    } else if (sanction.type === SanctionType.company_block) {
      const otherActiveBlockExists = await hasOtherActiveBlock(tx, sanction);
      const previousStatus = previousCompanyStatus(sanction.parameters);
      if (!otherActiveBlockExists && previousStatus !== CompanyStatus.blocked) {
        await tx.company.update({ where: { id: sanction.targetId }, data: { status: previousStatus } });
      }
    } else if (sanction.type === SanctionType.module_restriction) {
      await tx.userModuleRestriction.updateMany({
        where: { sanctionId: id, liftedAt: null },
        data: { liftedAt: new Date(), liftedById: user.id },
      });
    }
  });

  await invalidateCacheForSanction(deps, sanction.type, sanction.targetId);

  await deps.auditLog.record({
    actorId: user.id,
    action: `moderation.sanction.lift.${sanction.type}`,
    entityType: "Sanction",
    entityId: id,
    comment: input.comment,
    payload: { reasonCode: input.reasonCode },
  });

  await notifySanctionLift(deps, sanction).catch(
    swallowAndLog("moderation.sanction.lift.notify", { sanctionId: sanction.id }),
  );

  return deps.prisma.sanction.findUniqueOrThrow({ where: { id } });
}

function resolveSanctionTarget(
  type: AdminSanctionInput["type"],
  found: ModerationSanctionCaseWithRelations,
): { targetType: string; targetId: string } {
  if (type === "company_block") {
    return { targetType: "company", targetId: found.entityCompanyId! };
  }
  return { targetType: "user", targetId: found.entityAuthorId! };
}

function assertUserBlockAllowed(targetId: string, target: { email: string; status: UserStatus }, actor: RequestUser) {
  if (targetId === actor.id) {
    throw new BadRequestException("Нельзя заблокировать собственную учётную запись.");
  }

  const ownerEmail = (process.env.PLATFORM_OWNER_EMAIL ?? "mojosay@icloud.com").toLowerCase();
  if (target.email.toLowerCase() === ownerEmail) {
    throw new BadRequestException("Этот аккаунт защищён как первый администратор платформы.");
  }

  if (target.status === UserStatus.blocked) {
    throw new BadRequestException("Пользователь уже заблокирован.");
  }
}

async function hasOtherActiveBlock(
  tx: Prisma.TransactionClient,
  sanction: { id: string; type: SanctionType; targetType: string; targetId: string },
) {
  const count = await tx.sanction.count({
    where: {
      id: { not: sanction.id },
      type: sanction.type,
      targetType: sanction.targetType,
      targetId: sanction.targetId,
      liftedAt: null,
    },
  });
  return count > 0;
}

function previousUserStatus(parameters: Prisma.JsonValue | null): UserStatus {
  const previousStatus = parameterString(parameters, "previousStatus");
  return previousStatus === UserStatus.blocked ? UserStatus.blocked : UserStatus.active;
}

function previousCompanyStatus(parameters: Prisma.JsonValue | null): CompanyStatus {
  const previousStatus = parameterString(parameters, "previousStatus");
  const allowed = Object.values(CompanyStatus) as string[];
  return previousStatus && allowed.includes(previousStatus) ? (previousStatus as CompanyStatus) : CompanyStatus.active;
}

function parameterString(parameters: Prisma.JsonValue | null, key: string): string | null {
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return null;
  }

  const value = parameters[key];
  return typeof value === "string" ? value : null;
}

async function invalidateCacheForSanction(deps: ModerationSanctionDeps, type: SanctionType, targetId: string) {
  if (type === SanctionType.user_block) {
    await deps.sessionCache.invalidateUser(targetId);
  } else if (type === SanctionType.company_block) {
    await deps.sessionCache.invalidateCompany(targetId);
  }
}

function isAdmin(user: RequestUser) {
  return user.platformRoles.includes("admin");
}
