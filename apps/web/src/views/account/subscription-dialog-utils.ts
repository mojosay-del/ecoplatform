import type { SubscriptionPlan } from "@ecoplatform/shared";
import { formatRub } from "../../lib/formatters";
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

// Скидка при оплате за год. Платёжной системы пока нет — значение
// презентационное и обязано совпадать с бейджем на переключателе периода.
export const YEARLY_DISCOUNT_RATE = 0.27;

export function yearlyDiscountBadge(): string {
  return `-${Math.round(YEARLY_DISCOUNT_RATE * 100)}%`;
}

// Цена всегда показывается «за месяц»: в годовом режиме — месячная цена со
// скидкой (паттерн большинства SaaS), пояснение даёт planPriceNote.
export function planPriceLabel(tier: SubscriptionPlanTier, billingPeriod: BillingPeriod): string {
  if (tier.key === "demo" || tier.monthlyPriceRub === 0) return formatRub(0);
  if (billingPeriod === "year") return formatRub(Math.round(tier.monthlyPriceRub * (1 - YEARLY_DISCOUNT_RATE)));
  return formatRub(tier.monthlyPriceRub);
}

export function planPricePeriodLabel(tier: SubscriptionPlanTier): string | undefined {
  if (tier.key === "demo") return tier.pricePeriod;
  return "/ месяц";
}

// Подпись под ценой в годовом режиме: полная стоимость года со скидкой.
export function planPriceNote(tier: SubscriptionPlanTier, billingPeriod: BillingPeriod): string | undefined {
  if (tier.key === "demo" || billingPeriod !== "year" || tier.monthlyPriceRub === 0) return undefined;
  const yearlyTotal = Math.round(tier.monthlyPriceRub * 12 * (1 - YEARLY_DISCOUNT_RATE));
  return `${formatRub(yearlyTotal)} при оплате за год`;
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
