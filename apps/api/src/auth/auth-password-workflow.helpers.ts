import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { MIN_PASSWORD_LENGTH } from "@ecoplatform/shared";
import { EmailService } from "../email/email.service";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCacheService } from "../redis/session-cache.service";
import { PasswordPolicyService } from "./password-policy.service";

export type AuthPasswordWorkflowDeps = {
  prisma: PrismaService;
  passwordPolicy: PasswordPolicyService;
  sessionCache: SessionCacheService;
  email: EmailService;
};

/**
 * Workflow смены пароля авторизованным пользователем.
 *
 * Безопасность сохраняется в точности как было в AuthService.changePassword:
 * - минимальная длина и отличие от текущего пароля;
 * - проверка текущего пароля через bcrypt.compare;
 * - доменная password-policy (assertAcceptablePassword);
 * - hash нового пароля и отзыв всех ОСТАЛЬНЫХ сессий в одной транзакции;
 * - инвалидация кэша сессий пользователя.
 */
export async function changeAuthUserPassword(
  deps: AuthPasswordWorkflowDeps,
  userId: string,
  sessionId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<{ ok: true }> {
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestException(`Новый пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов.`);
  }
  if (input.newPassword === input.currentPassword) {
    throw new BadRequestException("Новый пароль должен отличаться от текущего.");
  }

  const user = await deps.prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new UnauthorizedException("Пользователь не найден.");
  }

  const ok = await compare(input.currentPassword, user.passwordHash);
  if (!ok) {
    throw new UnauthorizedException("Текущий пароль указан неверно.");
  }

  await deps.passwordPolicy.assertAcceptablePassword(input.newPassword);

  const passwordHash = await hash(input.newPassword, 12);
  await deps.prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    // Все остальные сессии отзываются — это стандартное требование безопасности.
    await tx.session.updateMany({
      where: { userId, revokedAt: null, NOT: { id: sessionId } },
      data: { revokedAt: new Date() },
    });
  });
  await deps.sessionCache.invalidateUser(userId);

  // Уведомляем владельца о смене пароля (best-effort — сбой письма не должен
  // ломать саму смену). Если менял не он — в письме совет завершить все сессии
  // и сменить пароль.
  await deps.email.sendPasswordChangedAlert({ to: user.email }).catch(() => undefined);

  return { ok: true };
}
