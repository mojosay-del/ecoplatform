import { UnauthorizedException } from "@nestjs/common";
import { CompanyStatus, UserStatus } from "@prisma/client";
import { compare } from "bcryptjs";
import type { LoginDto } from "@ecoplatform/shared";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import { PrismaService } from "../prisma/prisma.service";
import type { AuthSessionMeta, AuthSessionTokens } from "./auth-session-workflow.helpers";

// Реальный bcrypt-compare должен выполняться и для неизвестного email,
// иначе login выдаёт существование пользователя через заметно более быстрый ответ.
const LOGIN_DUMMY_PASSWORD_HASH = "$2a$12$abcdefghijklmnopqrstuv.WkOaBPyDV7c9o6XhOuLNS8tIeS5wXa";

type LoginLockoutState = {
  id: string;
  failedLoginAttempts: number;
  failedLoginWindowStartedAt: Date | null;
  lockedUntil: Date | null;
};

export type AuthLoginWorkflowDeps = {
  prisma: PrismaService;
  settings: PlatformSettingsService;
  createSession: (userId: string, meta: AuthSessionMeta, rememberMe: boolean) => Promise<AuthSessionTokens>;
};

export async function loginAuthUser(
  deps: AuthLoginWorkflowDeps,
  input: LoginDto,
  meta: AuthSessionMeta,
): Promise<AuthSessionTokens> {
  const user = await deps.prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    include: { company: true },
  });
  const passwordMatches = await compare(input.password, user?.passwordHash ?? LOGIN_DUMMY_PASSWORD_HASH);

  if (user && isLoginLocked(user)) {
    throw new UnauthorizedException(loginLockoutMessage(user.lockedUntil));
  }

  if (!user || !passwordMatches) {
    if (user) {
      const lockedUntil = await recordFailedLogin(deps, user);
      if (lockedUntil) {
        throw new UnauthorizedException(loginLockoutMessage(lockedUntil));
      }
    }
    throw new UnauthorizedException("Неверный email или пароль.");
  }

  if (user.status === UserStatus.blocked) {
    throw new UnauthorizedException("Учётная запись заблокирована.");
  }

  if (user.company?.status === CompanyStatus.blocked || user.company?.status === CompanyStatus.archived) {
    throw new UnauthorizedException("Доступ к кабинету компании закрыт.");
  }

  await resetFailedLoginState(deps, user);

  return deps.createSession(user.id, meta, Boolean(input.rememberMe));
}

function isLoginLocked(user: LoginLockoutState): boolean {
  return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
}

function loginLockoutMessage(lockedUntil: Date | null): string {
  const remainingMs = Math.max((lockedUntil?.getTime() ?? Date.now()) - Date.now(), 1);
  const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  return `Учётная запись временно заблокирована за слишком много попыток. Попробуйте через ${remainingMinutes} минут.`;
}

async function recordFailedLogin(deps: AuthLoginWorkflowDeps, user: LoginLockoutState): Promise<Date | null> {
  const now = new Date();
  // Параметры блокировки управляются из админки (Настройки -> Безопасность).
  const [threshold, windowMinutes, durationMinutes] = await Promise.all([
    deps.settings.getValue("security.login_lockout_threshold"),
    deps.settings.getValue("security.login_lockout_window_minutes"),
    deps.settings.getValue("security.login_lockout_duration_minutes"),
  ]);
  const windowStartedAt = user.failedLoginWindowStartedAt;
  const withinWindow = Boolean(
    windowStartedAt && now.getTime() - windowStartedAt.getTime() <= windowMinutes * 60 * 1000,
  );
  const failedLoginAttempts = withinWindow ? user.failedLoginAttempts + 1 : 1;
  const failedLoginWindowStartedAt = withinWindow ? windowStartedAt : now;
  const lockedUntil = failedLoginAttempts >= threshold ? new Date(now.getTime() + durationMinutes * 60 * 1000) : null;

  await deps.prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts,
      failedLoginWindowStartedAt,
      lockedUntil,
    },
  });

  return lockedUntil;
}

async function resetFailedLoginState(deps: AuthLoginWorkflowDeps, user: LoginLockoutState): Promise<void> {
  if (user.failedLoginAttempts === 0 && !user.failedLoginWindowStartedAt && !user.lockedUntil) {
    return;
  }
  await deps.prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: 0,
      failedLoginWindowStartedAt: null,
      lockedUntil: null,
    },
  });
}
