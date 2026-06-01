import type { AuthMeCompany } from "@ecoplatform/shared";

const FALLBACK_RETURN_PATH = "/news";

export function isSubscriptionSelectionRequired(company: AuthMeCompany | null | undefined, now = new Date()): boolean {
  if (!company) return false;

  if (company.status === "demo") {
    return isPast(company.demoEndsAt, now);
  }

  if (company.status === "past_due") {
    return true;
  }

  if (company.status === "active" && company.subscriptionPlan) {
    return isPast(company.subscriptionEndsAt, now);
  }

  return false;
}

export function safeSubscriptionReturnPath(value: string | null | undefined): string {
  const path = value?.trim();
  if (!path || !path.startsWith("/") || path.startsWith("//")) {
    return FALLBACK_RETURN_PATH;
  }

  if (/^\/(?:login|register|forgot-password|subscription)(?:[/?#]|$)/.test(path)) {
    return FALLBACK_RETURN_PATH;
  }

  return path;
}

export function subscriptionSelectionHref(from: string): string {
  return `/subscription?from=${encodeURIComponent(safeSubscriptionReturnPath(from))}`;
}

function isPast(value: string | null | undefined, now: Date): boolean {
  if (!value) return false;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time <= now.getTime();
}
