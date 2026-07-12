import { describe, expect, it } from "vitest";
import type { AuthMeUser } from "@ecoplatform/shared";
import { getDemoBannerState, shouldShowDemoBanner } from "./demo-banner-state";

function demoUser(demoEndsAt: string): AuthMeUser {
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
    companyRole: "owner",
    memberSections: null,
    onboardingToursCompleted: [],
    company: {
      id: "company-1",
      organizationName: "Демо ООО",
      type: "collector",
      status: "demo",
      demoEndsAt,
      subscriptionPlan: null,
      subscriptionEndsAt: null,
    },
    platformRoles: [],
    features: { marketplace: false, analyticsMap: false, participantMap: false, salesPrices: false },
    requiresReConsent: false,
    deletionRequestedAt: null,
    deletionScheduledFor: null,
  };
}

describe("DemoBanner", () => {
  it("shows for active trial company on regular pages and hides on admin routes", () => {
    const now = new Date("2026-05-27T09:00:00.000Z");
    const user = demoUser("2026-05-27T12:00:00.000Z");

    expect(shouldShowDemoBanner(user, "/news", now)).toBe(true);
    expect(shouldShowDemoBanner(user, "/admin/companies", now)).toBe(false);
  });

  it("formats normal and critical countdown text", () => {
    const now = new Date("2026-05-27T09:00:00.000Z");

    expect(getDemoBannerState("2026-05-27T14:31:00.000Z", now)).toEqual({
      mode: "normal",
      text: "5 ч 31 мин",
    });
    expect(getDemoBannerState("2026-05-27T10:05:00.000Z", now)).toEqual({
      mode: "critical",
      text: "65 мин",
    });
  });

  it("formats long countdown in days instead of hundreds of hours", () => {
    const now = new Date("2026-05-27T09:00:00.000Z");

    // 24 дня 8 часов — раньше показывалось как «584 ч 46 мин».
    expect(getDemoBannerState("2026-06-20T17:00:00.000Z", now)).toEqual({
      mode: "normal",
      text: "24 дня 8 ч",
    });
    // Ровно сутки без остатка — без «0 ч».
    expect(getDemoBannerState("2026-05-28T09:00:00.000Z", now)).toEqual({
      mode: "normal",
      text: "1 день",
    });
    expect(getDemoBannerState("2026-06-01T09:00:00.000Z", now)).toEqual({
      mode: "normal",
      text: "5 дней",
    });
  });

  it("does not render expired or invalid demo dates", () => {
    const now = new Date("2026-05-27T09:00:00.000Z");

    expect(getDemoBannerState("2026-05-27T08:59:00.000Z", now)).toBeNull();
    expect(getDemoBannerState("not-a-date", now)).toBeNull();
  });
});
