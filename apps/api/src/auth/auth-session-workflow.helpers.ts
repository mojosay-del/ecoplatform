import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CompanyStatus, UserStatus } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCacheService } from "../redis/session-cache.service";

export type AuthSessionTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthSessionMeta = {
  userAgent?: string;
  ipAddress?: string;
};

export type AuthSessionWorkflowDeps = {
  prisma: PrismaService;
  jwt: JwtService;
  sessionCache: SessionCacheService;
};

export async function createAuthSession(
  deps: AuthSessionWorkflowDeps,
  userId: string,
  meta: AuthSessionMeta,
  rememberMe: boolean,
): Promise<AuthSessionTokens> {
  // Хешируем только случайный хвост; sessionId сам по себе не секрет —
  // он лишь индекс для поиска сессии при refresh.
  const tail = randomBytes(48).toString("base64url");
  const refreshTokenHash = await hash(tail, 12);
  const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000);

  const session = await deps.prisma.session.create({
    data: {
      userId,
      refreshTokenHash,
      rememberMe,
      expiresAt,
      userAgent: meta.userAgent,
      ipAddress: meta.ipAddress,
    },
  });

  const refreshToken = `${session.id}.${tail}`;

  const accessToken = await deps.jwt.signAsync(
    { sub: userId, sessionId: session.id },
    {
      // Секрет проверяется в bootstrap() — здесь полагаемся, что он валиден.
      secret: process.env.JWT_ACCESS_SECRET as string,
      expiresIn: "15m",
      // Подписываем строго HS256 (симметричный секрет) — парно с пином в guard.
      algorithm: "HS256",
    },
  );

  return { accessToken, refreshToken };
}

export async function refreshAuthSession(
  deps: AuthSessionWorkflowDeps,
  refreshToken: string | undefined,
): Promise<AuthSessionTokens> {
  if (!refreshToken) {
    throw new UnauthorizedException("Refresh token отсутствует.");
  }

  // Формат токена — `${sessionId}.${tail}`: id сессии нужен, чтобы достать
  // ровно одну запись и сделать одно bcrypt-сравнение. Без id-привязки
  // пришлось бы перебирать все активные сессии в системе.
  const dot = refreshToken.indexOf(".");
  if (dot <= 0 || dot === refreshToken.length - 1) {
    throw new UnauthorizedException("Refresh token недействителен.");
  }
  const sessionId = refreshToken.slice(0, dot);
  const tail = refreshToken.slice(dot + 1);

  const session = await deps.prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: { include: { company: true } } },
  });

  if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
    throw new UnauthorizedException("Refresh token недействителен.");
  }

  const ok = await compare(tail, session.refreshTokenHash);
  if (!ok) {
    throw new UnauthorizedException("Refresh token недействителен.");
  }

  // Зеркало login: заблокированный пользователь или компания не должны
  // получить новую сессию, даже если refresh-токен формально валиден.
  if (session.user.status === UserStatus.blocked) {
    await deps.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedException("Учётная запись заблокирована.");
  }
  if (
    session.user.company?.status === CompanyStatus.blocked ||
    session.user.company?.status === CompanyStatus.archived
  ) {
    await deps.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    throw new UnauthorizedException("Доступ к кабинету компании закрыт.");
  }

  await deps.prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });
  await deps.sessionCache.invalidateSession(session.id);

  return createAuthSession(deps, session.userId, {}, session.rememberMe);
}

export async function logoutAuthSession(deps: AuthSessionWorkflowDeps, sessionId: string): Promise<{ ok: true }> {
  await deps.prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await deps.sessionCache.invalidateSession(sessionId);

  return { ok: true };
}

export async function listAuthSessions(deps: AuthSessionWorkflowDeps, userId: string, currentSessionId: string) {
  const sessions = await deps.prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      rememberMe: true,
      expiresAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return sessions.map((session) => ({
    ...session,
    current: session.id === currentSessionId,
  }));
}

export async function revokeAuthSession(
  deps: AuthSessionWorkflowDeps,
  userId: string,
  currentSessionId: string,
  sessionId: string,
): Promise<{ ok: true; revokedCurrent: boolean }> {
  const result = await deps.prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    throw new BadRequestException("Сессия уже завершена или не найдена.");
  }
  await deps.sessionCache.invalidateSession(sessionId);

  return { ok: true, revokedCurrent: sessionId === currentSessionId };
}

export async function logoutAllAuthSessions(
  deps: AuthSessionWorkflowDeps,
  userId: string,
): Promise<{ ok: true; revoked: number }> {
  const result = await deps.prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await deps.sessionCache.invalidateUser(userId);

  return { ok: true, revoked: result.count };
}
