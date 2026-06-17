import type { AuthMeUser } from "@ecoplatform/shared";

export function shouldRedirectFromMarketplace(user: Pick<AuthMeUser, "features"> | null | undefined): boolean {
  return user?.features.marketplace === false;
}
