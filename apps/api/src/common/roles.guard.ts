import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { PlatformRole } from "@ecoplatform/shared";
import { ROLES_KEY } from "./roles.decorator";
import type { RequestUser } from "./request-user";

type RequestWithUser = Request & { user?: RequestUser };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.reflector.getAllAndOverride<PlatformRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!expected || expected.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const roles = request.user?.platformRoles ?? [];

    if (expected.some((role) => roles.includes(role))) {
      return true;
    }

    throw new ForbiddenException("Недостаточно прав для этого раздела.");
  }
}
