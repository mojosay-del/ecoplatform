import { describe, expect, it } from "vitest";
import type { AuthMeCompany } from "@ecoplatform/shared";
import { isSubscriptionSelectionRequired, safeSubscriptionReturnPath } from "./subscription-access";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function company(overrides: Partial<AuthMeCompany>): AuthMeCompany {
  return {
    id: "company-1",
    organizationName: "ООО Тест",
    type: "collector",
    status: "demo",
    demoEndsAt: null,
    subscriptionPlan: null,
    subscriptionEndsAt: null,
    ...overrides,
  };
}

describe("subscription access helpers", () => {
  it("requires the subscription gate for missing/expired trial or paid subscriptions", () => {
    expect(isSubscriptionSelectionRequired(company({ demoEndsAt: null }), NOW)).toBe(true);
    expect(isSubscriptionSelectionRequired(company({ demoEndsAt: "2026-05-31T12:00:00.000Z" }), NOW)).toBe(true);
    expect(
      isSubscriptionSelectionRequired(
        company({
          status: "active",
          subscriptionPlan: "basic",
          subscriptionEndsAt: "2026-05-31T12:00:00.000Z",
        }),
        NOW,
      ),
    ).toBe(true);
    expect(isSubscriptionSelectionRequired(company({ status: "past_due" }), NOW)).toBe(true);
  });

  it("does not redirect active users or non-billing restrictions", () => {
    expect(isSubscriptionSelectionRequired(company({ demoEndsAt: "2026-06-02T12:00:00.000Z" }), NOW)).toBe(false);
    expect(
      isSubscriptionSelectionRequired(
        company({
          status: "active",
          subscriptionPlan: "basic",
          subscriptionEndsAt: "2026-06-02T12:00:00.000Z",
        }),
        NOW,
      ),
    ).toBe(false);
    expect(isSubscriptionSelectionRequired(company({ status: "suspended" }), NOW)).toBe(false);
    expect(isSubscriptionSelectionRequired(company({ status: "pending_deletion" }), NOW)).toBe(false);
  });

  it("keeps return paths internal and avoids subscription loops", () => {
    expect(safeSubscriptionReturnPath("/news?tag=PET")).toBe("/news?tag=PET");
    expect(safeSubscriptionReturnPath("https://evil.test/news")).toBe("/news");
    expect(safeSubscriptionReturnPath("//evil.test/news")).toBe("/news");
    expect(safeSubscriptionReturnPath("/subscription?from=/news")).toBe("/news");
  });
});
