import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import type { RequestUser } from "../common/request-user";

type RequestWithUser = Request & { user?: RequestUser };

// Публично ли открыта торговая площадка. MARKETPLACE_ENABLED=1 открывает раздел
// всем авторизованным пользователям; при выключенном флаге остаётся доступ
// только платформенным админам для служебной проверки.
export function isMarketplacePubliclyEnabled(): boolean {
  return process.env.MARKETPLACE_ENABLED === "1";
}

@Injectable()
export class MarketplaceFeatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const isAdmin = request.user?.platformRoles?.includes("admin") ?? false;

    if (isAdmin || isMarketplacePubliclyEnabled()) {
      return true;
    }

    // 404, а не 403: пока раздел закрыт, честнее «его нет», чем «вам нельзя».
    throw new NotFoundException();
  }
}
