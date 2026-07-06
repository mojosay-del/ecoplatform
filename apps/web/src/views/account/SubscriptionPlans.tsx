import { ArrowRight, Check, X } from "lucide-react";
import { SUBSCRIPTION_PLAN_TIERS, type SubscriptionPlanTier } from "../../lib/subscription-plans";
import type { BillingPeriod, SubscriptionChoiceKey, SubscriptionCompanySnapshot } from "./subscription-dialog-types";
import {
  currentPlanButtonLabel,
  isActivePaidSubscription,
  isActiveTrial,
  planButtonLabel,
  planPriceLabel,
  planPriceNote,
  planPricePeriodLabel,
  subscriptionChoiceRank,
  yearlyDiscountBadge,
} from "./subscription-dialog-utils";

export function SubscriptionPlans({
  billingPeriod,
  busyPlan,
  canChoosePlan,
  currentCompany,
  currentPlanKey,
  currentPlanRank,
  onActivateChoice,
  setBillingPeriod,
  trialAlreadyUsed,
}: {
  billingPeriod: BillingPeriod;
  busyPlan: SubscriptionChoiceKey | null;
  canChoosePlan: boolean;
  currentCompany: SubscriptionCompanySnapshot | null;
  currentPlanKey: SubscriptionPlanTier["key"] | null;
  currentPlanRank: number;
  onActivateChoice: (plan: SubscriptionChoiceKey) => void | Promise<void>;
  setBillingPeriod: (period: BillingPeriod) => void;
  trialAlreadyUsed: boolean;
}) {
  const activePaidSubscription = isActivePaidSubscription(currentCompany);

  return (
    <div className="account-plans">
      {SUBSCRIPTION_PLAN_TIERS.map((tier) => {
        const isCurrent = tier.key === currentPlanKey;
        const popular = tier.key === "basic";
        const isTrial = tier.key === "demo";
        const pending = busyPlan === tier.key;
        const isUpgrade = activePaidSubscription && subscriptionChoiceRank(tier.key) > currentPlanRank;
        const disabled = isTrial
          ? !canChoosePlan || activePaidSubscription || trialAlreadyUsed
          : !canChoosePlan || (activePaidSubscription && !isUpgrade);
        const disabledLabel =
          activePaidSubscription && !isUpgrade
            ? "Подписка активна"
            : isTrial && trialAlreadyUsed
              ? isActiveTrialLabel(currentCompany)
              : undefined;
        const currentLabel = isCurrent ? currentPlanButtonLabel(currentCompany, currentPlanKey) : undefined;

        return (
          <article
            className={`account-plan${isCurrent ? " is-current" : ""}${popular ? " is-popular" : ""}`}
            key={tier.key}
          >
            {popular ? <span className="account-plan-badge">Рекомендуем</span> : null}
            <h3 className="account-plan-name">{tier.name}</h3>
            <p className="account-plan-desc">{tier.description}</p>
            <div className={`account-plan-price${isTrial ? "" : " is-switchable"}`}>
              <span className="account-plan-price-value">
                <span className="account-plan-amount">{planPriceLabel(tier, billingPeriod)}</span>
                {planPricePeriodLabel(tier) ? (
                  <span className="account-plan-period">{planPricePeriodLabel(tier)}</span>
                ) : null}
              </span>
              {isTrial ? null : (
                <BillingPeriodToggle billingPeriod={billingPeriod} setBillingPeriod={setBillingPeriod} />
              )}
            </div>
            {planPriceNote(tier, billingPeriod) ? (
              <p className="account-plan-price-note">{planPriceNote(tier, billingPeriod)}</p>
            ) : null}
            <ul className="account-plan-features">
              {tier.features.map((feature) => (
                <li className={feature.included ? undefined : "is-off"} key={feature.label}>
                  <span className={`account-plan-check${feature.included ? "" : " is-off"}`}>
                    {feature.included ? <Check size={12} /> : <X size={12} />}
                  </span>
                  {feature.label}
                </li>
              ))}
            </ul>
            <button
              aria-busy={pending || undefined}
              className={popular ? "button" : "button secondary"}
              disabled={disabled || pending || isCurrent}
              onClick={() => void onActivateChoice(tier.key)}
              type="button"
            >
              <span>{planButtonLabel({ currentLabel, disabledLabel, isCurrent, isUpgrade, pending, tier })}</span>
              {!pending && !isCurrent && !disabledLabel ? <ArrowRight aria-hidden="true" size={16} /> : null}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function BillingPeriodToggle({
  billingPeriod,
  setBillingPeriod,
}: {
  billingPeriod: BillingPeriod;
  setBillingPeriod: (period: BillingPeriod) => void;
}) {
  return (
    <div aria-label="Период расчёта цены" className="account-billing-period-toggle" role="group">
      <button
        aria-pressed={billingPeriod === "month"}
        className={billingPeriod === "month" ? "is-active" : undefined}
        onClick={() => setBillingPeriod("month")}
        type="button"
      >
        Месяц
      </button>
      <button
        aria-pressed={billingPeriod === "year"}
        className={billingPeriod === "year" ? "is-active" : undefined}
        onClick={() => setBillingPeriod("year")}
        type="button"
      >
        <span>Год</span>
        <span className="account-billing-period-discount">{yearlyDiscountBadge()}</span>
      </button>
    </div>
  );
}

function isActiveTrialLabel(company: SubscriptionCompanySnapshot | null): string {
  return isActiveTrial(company) ? "Пробный доступ активен" : "Пробный доступ использован";
}
