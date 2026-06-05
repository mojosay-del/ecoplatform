import { UnauthorizedException } from "@nestjs/common";
import { CompanyRole, CompanyStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCacheService } from "../redis/session-cache.service";
import { accountDeletionScheduledFor } from "./auth-profile.helpers";

export type AccountDeletionResponse = {
  ok: true;
  deletionRequestedAt: string | null;
  deletionScheduledFor: string | null;
};

export type AuthAccountDeletionDeps = {
  prisma: PrismaService;
  sessionCache: SessionCacheService;
};

export async function requestAuthAccountDeletion(
  deps: AuthAccountDeletionDeps,
  userId: string,
  sessionId: string,
): Promise<AccountDeletionResponse> {
  const now = new Date();
  const result = await deps.prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          select: { id: true, status: true, statusBeforeDeletion: true },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException("Пользователь не найден.");
    }

    const deletionRequestedAt = user.deletionRequestedAt ?? now;
    if (!user.deletionRequestedAt) {
      await tx.user.update({
        where: { id: userId },
        data: { deletionRequestedAt },
      });
    }

    // В pending_deletion переводим ВСЮ компанию только когда удаляется её
    // владелец: уход владельца = закрытие компании со всеми сотрудниками
    // (крон-чистка удалит компанию, когда не останется пользователей).
    // Участник (member) удаляет лишь свой аккаунт — компания и доступ
    // остальных сотрудников не страдают; крон вычистит только его user-строку
    // по deletionRequestedAt, оставив компанию работать.
    //
    // На вырост: для multi-user компаний удаление владельца стоит заменить на
    // передачу прав владельца другому сотруднику — иначе уход владельца
    // закрывает доступ всем. Пока в проде компании 1:1, поэтому сохраняем
    // прежнее поведение «владелец ушёл → компания закрывается».
    const isOwner = user.companyRole === CompanyRole.owner;
    if (user.company && isOwner && user.company.status !== CompanyStatus.pending_deletion) {
      await tx.company.update({
        where: { id: user.company.id },
        data: {
          status: CompanyStatus.pending_deletion,
          statusBeforeDeletion: user.company.status,
        },
      });
    }

    await tx.session.updateMany({
      where: { userId, revokedAt: null, NOT: { id: sessionId } },
      data: { revokedAt: now },
    });

    return {
      companyId: user.companyId,
      deletionRequestedAt,
    };
  });

  await deps.sessionCache.invalidateUser(userId);

  return serializeAccountDeletion(result.deletionRequestedAt);
}

export async function cancelAuthAccountDeletion(
  deps: AuthAccountDeletionDeps,
  userId: string,
): Promise<AccountDeletionResponse> {
  await deps.prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      include: {
        company: {
          select: { id: true, status: true, statusBeforeDeletion: true },
        },
      },
    });
    if (!user) {
      throw new UnauthorizedException("Пользователь не найден.");
    }

    await tx.user.update({
      where: { id: userId },
      data: { deletionRequestedAt: null },
    });

    if (user.company?.status === CompanyStatus.pending_deletion) {
      const otherPendingUsers = await tx.user.count({
        where: {
          companyId: user.company.id,
          id: { not: userId },
          deletionRequestedAt: { not: null },
        },
      });

      if (otherPendingUsers === 0) {
        await tx.company.update({
          where: { id: user.company.id },
          data: {
            status: user.company.statusBeforeDeletion ?? CompanyStatus.demo,
            statusBeforeDeletion: null,
          },
        });
      }
    }
  });

  await deps.sessionCache.invalidateUser(userId);

  return serializeAccountDeletion(null);
}

function serializeAccountDeletion(requestedAt: Date | null): AccountDeletionResponse {
  return {
    ok: true,
    deletionRequestedAt: requestedAt?.toISOString() ?? null,
    deletionScheduledFor: requestedAt ? accountDeletionScheduledFor(requestedAt).toISOString() : null,
  };
}
