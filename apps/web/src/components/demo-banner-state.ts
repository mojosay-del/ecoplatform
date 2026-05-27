import type { AuthMeUser } from "@ecoplatform/shared";

const CRITICAL_DEMO_MS = 2 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export type DemoBannerState = {
  mode: "normal" | "critical";
  text: string;
};

export function shouldShowDemoBanner(
  user: Pick<AuthMeUser, "company"> | null | undefined,
  pathname: string,
  now = new Date(),
): boolean {
  const company = user?.company;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return false;
  if (company?.status !== "demo" || !company.demoEndsAt) return false;

  return new Date(company.demoEndsAt).getTime() > now.getTime();
}

export function getDemoBannerState(demoEndsAt: string, now = new Date()): DemoBannerState | null {
  const remainingMs = new Date(demoEndsAt).getTime() - now.getTime();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;

  if (remainingMs <= CRITICAL_DEMO_MS) {
    return {
      mode: "critical",
      text: `Демо закончится через ${Math.max(1, Math.ceil(remainingMs / MINUTE_MS))} мин.`,
    };
  }

  const totalMinutes = Math.ceil(remainingMs / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    mode: "normal",
    text: `Демо-доступ закончится через ${hours} ч ${minutes} мин.`,
  };
}
