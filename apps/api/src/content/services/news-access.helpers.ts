import { NotFoundException } from "@nestjs/common";
import { NewsAccessTier, Prisma } from "@prisma/client";
import { canAccessNewsTier } from "@ecoplatform/shared";
import { isPlatformStaff } from "../../common/access-policy";
import type { RequestUser } from "../../common/request-user";

export function canUserAccessNewsTier(user: RequestUser, accessTier: NewsAccessTier): boolean {
  if (isPlatformStaff(user)) {
    return true;
  }
  return Boolean(user.company && canAccessNewsTier(user.company, accessTier));
}

export function newsAccessWhere(user: RequestUser): Prisma.NewsPostWhereInput {
  return canUserAccessNewsTier(user, NewsAccessTier.extended) ? {} : { accessTier: NewsAccessTier.basic };
}

export function assertUserCanAccessNewsTier(
  user: RequestUser,
  accessTier: NewsAccessTier,
  message = "Новость не найдена.",
): void {
  if (!canUserAccessNewsTier(user, accessTier)) {
    throw new NotFoundException(message);
  }
}
