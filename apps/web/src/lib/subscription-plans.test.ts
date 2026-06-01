import { describe, expect, it } from "vitest";
import { subscriptionPlans } from "@ecoplatform/shared";
import { PAID_SUBSCRIPTION_PLAN_TIERS, SUBSCRIPTION_PLAN_TIERS } from "./subscription-plans";

describe("subscription plan tiers", () => {
  it("keeps the public paid plan cards in sync with the shared domain enum", () => {
    expect(PAID_SUBSCRIPTION_PLAN_TIERS.map((tier) => tier.key)).toEqual(subscriptionPlans);
    expect(PAID_SUBSCRIPTION_PLAN_TIERS.map((tier) => tier.name)).toEqual(["Базовая", "Расширенная"]);
  });

  it("keeps demo only in the account tariff overview", () => {
    expect(SUBSCRIPTION_PLAN_TIERS.map((tier) => tier.key)).toEqual(["demo", "basic", "extended"]);
  });
});
