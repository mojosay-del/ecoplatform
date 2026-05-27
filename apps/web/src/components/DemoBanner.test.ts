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
    requiresReConsent: false,
    deletionRequestedAt: null,
    deletionScheduledFor: null,
  };
}

describe("DemoBanner", () => {
  it("shows for active demo company on regular pages and hides on admin routes", () => {
    const now = new Date("2026-05-27T09:00:00.000Z");
    const user = demoUser("2026-05-27T12:00:00.000Z");

    expect(shouldShowDemoBanner(user, "/news", now)).toBe(true);
    expect(shouldShowDemoBanner(user, "/admin/companies", now)).toBe(false);
  });

  it("formats normal and critical countdown text", () => {
    const now = new Date("2026-05-27T09:00:00.000Z");

    expect(getDemoBannerState("2026-05-27T14:31:00.000Z", now)).toEqual({
      mode: "normal",
      text: "Демо-доступ закончится через 5 ч 31 мин.",
    });
    expect(getDemoBannerState("2026-05-27T10:05:00.000Z", now)).toEqual({
      mode: "critical",
      text: "Демо закончится через 65 мин.",
    });
  });

  it("does not render expired or invalid demo dates", () => {
    const now = new Date("2026-05-27T09:00:00.000Z");

    expect(getDemoBannerState("2026-05-27T08:59:00.000Z", now)).toBeNull();
    expect(getDemoBannerState("not-a-date", now)).toBeNull();
  });
});
