import type { SubscriptionPlanTier } from "../../lib/subscription-plans";

export type SubscriptionChoiceKey = SubscriptionPlanTier["key"];
export type BillingPeriod = "month" | "year";

export type SubscriptionCompanySnapshot = {
  status?: string;
  demoEndsAt?: string | null;
  subscriptionPlan?: string | null;
  subscriptionEndsAt?: string | null;
  organizationName?: string | null;
};
