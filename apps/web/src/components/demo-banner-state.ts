import type { AuthMeUser } from "@ecoplatform/shared";

const CRITICAL_DEMO_MS = 2 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Русское склонение слова «день» по числу.
function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "дня";
  return "дней";
}

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
      text: `${Math.max(1, Math.ceil(remainingMs / MINUTE_MS))} мин`,
    };
  }

  // От суток и больше — показываем дни (плюс остаток в часах), иначе
  // получается нечитаемое «584 ч 46 мин».
  if (remainingMs >= DAY_MS) {
    const days = Math.floor(remainingMs / DAY_MS);
    const hoursRest = Math.floor((remainingMs % DAY_MS) / HOUR_MS);
    return {
      mode: "normal",
      text: hoursRest > 0 ? `${days} ${pluralDays(days)} ${hoursRest} ч` : `${days} ${pluralDays(days)}`,
    };
  }

  const totalMinutes = Math.ceil(remainingMs / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return {
    mode: "normal",
    text: `${hours} ч ${minutes} мин`,
  };
}
