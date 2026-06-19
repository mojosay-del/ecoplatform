import type { SubscriptionPlan } from "@ecoplatform/shared";
import type { SubscriptionPlanTier } from "../../lib/subscription-plans";
import { formatAccountDate } from "./format";
import type { BillingPeriod, SubscriptionChoiceKey, SubscriptionCompanySnapshot } from "./subscription-dialog-types";

export function currentPlanButtonLabel(
  company: SubscriptionCompanySnapshot | null,
  currentPlanKey: SubscriptionPlanTier["key"] | null,
): string | undefined {
  const endsAt = currentPlanKey === "demo" ? company?.demoEndsAt : company?.subscriptionEndsAt;
  return endsAt ? `Действует до ${formatAccountDate(endsAt)}` : undefined;
}

export function currentSubscriptionPlanKey(
  company: SubscriptionCompanySnapshot | null,
  now = Date.now(),
): SubscriptionPlanTier["key"] | null {
  if (isActivePaidSubscription(company, now) && company?.subscriptionPlan === "extended") return "extended";
  if (isActivePaidSubscription(company, now) && company?.subscriptionPlan === "basic") return "basic";
  if (isActiveTrial(company, now)) return "demo";
  return null;
}

export function planButtonLabel({
  currentLabel,
  disabledLabel,
  isCurrent,
  isUpgrade,
  pending,
  tier,
}: {
  currentLabel?: string;
  disabledLabel?: string;
  isCurrent: boolean;
  isUpgrade: boolean;
  pending: boolean;
  tier: SubscriptionPlanTier;
}) {
  if (isCurrent) return currentLabel ?? "Текущий план";
  if (pending) return tier.key === "demo" ? "Включаем..." : isUpgrade ? "Улучшаем..." : "Активируем...";
  if (isUpgrade) return "Улучшить";
  if (disabledLabel) return disabledLabel;
  if (tier.key === "demo") return "Включить пробный";
  return tier.key === "basic" ? "Выбрать базовую" : "Выбрать расширенную";
}

export function planPriceLabel(tier: SubscriptionPlanTier): string {
  return tier.price ?? "0 ₽";
}

export function planPricePeriodLabel(tier: SubscriptionPlanTier, billingPeriod: BillingPeriod): string | undefined {
  if (tier.key === "demo") return tier.pricePeriod;
  return billingPeriod === "month" ? "/ месяц" : "/ год";
}

export function subscriptionChoiceRank(plan: SubscriptionChoiceKey | string | null | undefined): number {
  if (plan === "demo") return 0;
  if (plan === "basic") return 1;
  if (plan === "extended") return 2;
  return -1;
}

export function isActiveTrial(company: SubscriptionCompanySnapshot | null, now = Date.now()): boolean {
  if (company?.status !== "demo") return false;
  const trialEndsAt = parseDateTime(company.demoEndsAt);
  return trialEndsAt !== null && trialEndsAt > now;
}

export function isActivePaidSubscription(company: SubscriptionCompanySnapshot | null, now = Date.now()): boolean {
  if (company?.status !== "active" || !company.subscriptionPlan) return false;
  const subscriptionEndsAt = parseDateTime(company.subscriptionEndsAt);
  return subscriptionEndsAt !== null && subscriptionEndsAt > now;
}

export function createSubscriptionIdempotencyKey(plan: SubscriptionPlan): string {
  const random = randomIdempotencySuffix();
  return `self-subscription-${plan}-${random}`;
}

export function createTrialIdempotencyKey(): string {
  const random = randomIdempotencySuffix();
  return `self-trial-${random}`;
}

function parseDateTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function randomIdempotencySuffix(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
