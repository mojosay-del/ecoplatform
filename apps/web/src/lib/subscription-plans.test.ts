import { describe, expect, it } from "vitest";
import { PLAN_BASE_PRICE_RUB, subscriptionPlans } from "@ecoplatform/shared";
import { PAID_SUBSCRIPTION_PLAN_TIERS, SUBSCRIPTION_PLAN_TIERS } from "./subscription-plans";

describe("subscription plan tiers", () => {
  it("keeps the public paid plan cards in sync with the shared domain enum", () => {
    expect(PAID_SUBSCRIPTION_PLAN_TIERS.map((tier) => tier.key)).toEqual(subscriptionPlans);
    expect(PAID_SUBSCRIPTION_PLAN_TIERS.map((tier) => tier.name)).toEqual(["Базовая", "Расширенная"]);
  });

  it("keeps plan card prices in sync with the shared base prices (same source as seat pricing)", () => {
    for (const tier of PAID_SUBSCRIPTION_PLAN_TIERS) {
      expect(tier.monthlyPriceRub).toBe(PLAN_BASE_PRICE_RUB[tier.key]);
    }
    expect(SUBSCRIPTION_PLAN_TIERS.find((tier) => tier.key === "demo")?.monthlyPriceRub).toBe(0);
  });

  it("keeps trial before paid plans in public plan overview", () => {
    expect(SUBSCRIPTION_PLAN_TIERS.map((tier) => tier.key)).toEqual(["demo", "basic", "extended"]);
    expect(SUBSCRIPTION_PLAN_TIERS[0]!.name).toBe("Пробный");
  });
});
