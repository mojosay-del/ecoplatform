import type { AuthMeUser } from "@ecoplatform/shared";

export const NEWS_ONBOARDING_STORAGE_KEY = "eco_onboarding_v1_dismissed";

export function shouldShowNewsOnboarding(
  user: Pick<AuthMeUser, "company"> | null | undefined,
  dismissed: boolean,
  now = new Date(),
): boolean {
  const demoEndsAt = user?.company?.demoEndsAt;
  if (dismissed || user?.company?.status !== "demo" || !demoEndsAt) return false;

  return new Date(demoEndsAt).getTime() > now.getTime();
}

export function formatOnboardingDemoDate(value: string | Date): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return date
    .toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .replace(/\s?г\.$/, "");
}
