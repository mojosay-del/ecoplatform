import { describe, expect, it, vi } from "vitest";
import { SUBSCRIPTION_PLAN_TIERS } from "../../lib/subscription-plans";
import type { SubscriptionCompanySnapshot } from "./subscription-dialog-types";
import {
  createSubscriptionIdempotencyKey,
  createTrialIdempotencyKey,
  currentSubscriptionPlanKey,
  isActivePaidSubscription,
  isActiveTrial,
  planButtonLabel,
  planPricePeriodLabel,
  subscriptionChoiceRank,
} from "./subscription-dialog-utils";

const NOW = new Date("2026-06-19T12:00:00.000Z").getTime();
const demoTier = SUBSCRIPTION_PLAN_TIERS.find((tier) => tier.key === "demo")!;
const basicTier = SUBSCRIPTION_PLAN_TIERS.find((tier) => tier.key === "basic")!;
const extendedTier = SUBSCRIPTION_PLAN_TIERS.find((tier) => tier.key === "extended")!;

function company(overrides: Partial<SubscriptionCompanySnapshot>): SubscriptionCompanySnapshot {
  return {
    organizationName: "ООО Тест",
    status: "demo",
    demoEndsAt: null,
    subscriptionPlan: null,
    subscriptionEndsAt: null,
    ...overrides,
  };
}

describe("subscription dialog utils", () => {
  it("detects active and expired trial access", () => {
    expect(isActiveTrial(company({ demoEndsAt: "2026-06-20T12:00:00.000Z" }), NOW)).toBe(true);
    expect(isActiveTrial(company({ demoEndsAt: "2026-06-18T12:00:00.000Z" }), NOW)).toBe(false);
    expect(currentSubscriptionPlanKey(company({ demoEndsAt: "2026-06-20T12:00:00.000Z" }), NOW)).toBe("demo");
  });

  it("detects active paid plans and their ranking", () => {
    const basicCompany = company({
      status: "active",
      subscriptionPlan: "basic",
      subscriptionEndsAt: "2026-06-20T12:00:00.000Z",
    });
    const extendedCompany = company({
      status: "active",
      subscriptionPlan: "extended",
      subscriptionEndsAt: "2026-06-20T12:00:00.000Z",
    });

    expect(isActivePaidSubscription(basicCompany, NOW)).toBe(true);
    expect(currentSubscriptionPlanKey(basicCompany, NOW)).toBe("basic");
    expect(currentSubscriptionPlanKey(extendedCompany, NOW)).toBe("extended");
    expect(subscriptionChoiceRank("demo")).toBeLessThan(subscriptionChoiceRank("basic"));
    expect(subscriptionChoiceRank("basic")).toBeLessThan(subscriptionChoiceRank("extended"));
  });

  it("returns subscription button labels for current, upgrade, disabled and pending states", () => {
    expect(
      planButtonLabel({
        currentLabel: "Действует до 20.06.2026",
        disabledLabel: undefined,
        isCurrent: true,
        isUpgrade: false,
        pending: false,
        tier: basicTier,
      }),
    ).toBe("Действует до 20.06.2026");
    expect(
      planButtonLabel({
        disabledLabel: undefined,
        isCurrent: false,
        isUpgrade: true,
        pending: false,
        tier: extendedTier,
      }),
    ).toBe("Улучшить");
    expect(
      planButtonLabel({
        disabledLabel: "Пробный доступ использован",
        isCurrent: false,
        isUpgrade: false,
        pending: false,
        tier: demoTier,
      }),
    ).toBe("Пробный доступ использован");
    expect(
      planButtonLabel({
        disabledLabel: undefined,
        isCurrent: false,
        isUpgrade: true,
        pending: true,
        tier: extendedTier,
      }),
    ).toBe("Улучшаем...");
  });

  it("returns period labels without changing trial copy", () => {
    expect(planPricePeriodLabel(demoTier, "year")).toBe("/ 24 часа");
    expect(planPricePeriodLabel(basicTier, "month")).toBe("/ месяц");
    expect(planPricePeriodLabel(basicTier, "year")).toBe("/ год");
  });

  it("creates idempotency keys with stable prefixes", () => {
    const randomUUID = vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("uuid-1");

    expect(createTrialIdempotencyKey()).toBe("self-trial-uuid-1");
    expect(createSubscriptionIdempotencyKey("basic")).toBe("self-subscription-basic-uuid-1");

    randomUUID.mockRestore();
  });
});
