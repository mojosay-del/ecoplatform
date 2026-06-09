import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import type { Request } from "express";
import type { RequestUser } from "../common/request-user";

type RequestWithUser = Request & { user?: RequestUser };

// Публично ли открыта торговая площадка. Пока флаг выключен, раздел строится
// «за закрытыми дверьми»: доступен только платформенным админам (дог-фуд на
// проде), у обычных пользователей его как будто не существует. На фазе запуска
// выставляется MARKETPLACE_ENABLED=1 — и доступ получают все авторизованные
// пользователи (подписочный гейт добавится отдельно на той же фазе).
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
