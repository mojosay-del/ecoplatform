import { describe, expect, it } from "vitest";
import type { AuthMeUser } from "@ecoplatform/shared";
import { formatOnboardingDemoDate, shouldShowNewsOnboarding } from "./news-onboarding-state";

function demoUser(demoEndsAt: string | null, status: "demo" | "active" = "demo"): AuthMeUser {
  return {
    id: "user-1",
    email: "demo@example.test",
    phone: "+79990000000",
    firstName: "Демо",
    lastName: "Пользователь",
    gender: "male",
    status: "active",
    avatarUrl: null,
    companyId: "company-1",
    company: {
      id: "company-1",
      organizationName: "Демо ООО",
      type: "collector",
      status,
      demoEndsAt,
      subscriptionPlan: null,
      subscriptionEndsAt: null,
    },
    platformRoles: [],
    requiresReConsent: false,
    deletionRequestedAt: null,
    deletionScheduledFor: null,
  };
}

describe("NewsOnboardingCard state", () => {
  it("shows only for an active demo company that has not dismissed onboarding", () => {
    const now = new Date("2026-05-27T09:00:00.000Z");

    expect(shouldShowNewsOnboarding(demoUser("2026-05-30T09:00:00.000Z"), false, now)).toBe(true);
    expect(shouldShowNewsOnboarding(demoUser("2026-05-30T09:00:00.000Z"), true, now)).toBe(false);
    expect(shouldShowNewsOnboarding(demoUser("2026-05-26T09:00:00.000Z"), false, now)).toBe(false);
    expect(shouldShowNewsOnboarding(demoUser(null), false, now)).toBe(false);
    expect(shouldShowNewsOnboarding(demoUser("2026-05-30T09:00:00.000Z", "active"), false, now)).toBe(false);
  });

  it("formats the demo date for the welcome text", () => {
    expect(formatOnboardingDemoDate("2026-05-30T09:00:00.000Z")).toBe("30 мая 2026");
    expect(formatOnboardingDemoDate("not-a-date")).toBeNull();
  });
});
