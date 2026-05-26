import { CanActivate, ExecutionContext, Injectable, Optional, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserStatus } from "@prisma/client";
import type { Request } from "express";
import { PinoLogger } from "nestjs-pino";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCacheService } from "../redis/session-cache.service";
import { resolveActorRole } from "./logging";
import { recordAuthCacheHit, recordAuthCacheMiss } from "../observability/metrics.registry";
import type { RequestUser } from "./request-user";

type RequestWithUser = Request & { user?: RequestUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Optional()
    private readonly sessionCache?: SessionCacheService,
    @Optional()
    private readonly logger?: PinoLogger,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.header("authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

    if (!token) {
      throw new UnauthorizedException("Нужна авторизация.");
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; sessionId: string }>(token, {
        // Секрет проверяется в bootstrap() — без него процесс не стартует.
        secret: process.env.JWT_ACCESS_SECRET as string,
      });

      const cached = await this.sessionCache?.get(payload.sessionId);
      if (cached?.id === payload.sub) {
        recordAuthCacheHit();
        request.user = cached;
        this.assignUserLogFields(cached);
        return true;
      }
      recordAuthCacheMiss();

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          company: true,
          platformStaff: true,
          sessions: {
            where: { id: payload.sessionId, revokedAt: null },
            take: 1,
          },
        },
      });

      if (!user || user.sessions.length === 0) {
        throw new UnauthorizedException("Сессия не найдена.");
      }

      if (user.status === UserStatus.blocked) {
        throw new UnauthorizedException("Учётная запись заблокирована.");
      }

      if (user.company?.status === "blocked" || user.company?.status === "archived") {
        throw new UnauthorizedException("Доступ к компании закрыт.");
      }

      // Деактивированный сотрудник теряет платформенные роли, но может остаться
      // обычным пользователем компании. Если он одновременно и стафф, и член компании,
      // его кабинет продолжает работать — пропадают только админ-роуты.
      const platformRoles = user.platformStaff?.isActive ? user.platformStaff.roles : [];

      const requestUser: RequestUser = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        companyId: user.companyId,
        platformRoles,
        company: user.company
          ? {
              type: user.company.type,
              status: user.company.status,
              demoEndsAt: user.company.demoEndsAt,
              subscriptionPlan: user.company.subscriptionPlan,
              subscriptionEndsAt: user.company.subscriptionEndsAt,
            }
          : null,
        sessionId: payload.sessionId,
      };
      request.user = requestUser;
      this.assignUserLogFields(requestUser);
      await this.sessionCache?.set(requestUser);

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException("Токен недействителен.");
    }
  }

  private assignUserLogFields(user: RequestUser) {
    this.logger?.assign({
      userId: user.id,
      sessionId: user.sessionId,
      companyId: user.companyId,
      actorRole: resolveActorRole(user),
    });
  }
}
