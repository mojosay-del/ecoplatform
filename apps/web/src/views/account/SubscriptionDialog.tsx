import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { BillingStatus, SubscriptionPlan } from "@ecoplatform/shared";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { SubscriptionPlanTier } from "../../lib/subscription-plans";
import type { ApiState } from "../shared/use-api-query";
import { describeSubscription } from "./format";
import { useAccountDialogBodyLock, useAccountDialogFocusTrap } from "./hooks";
import { SubscriptionPlans } from "./SubscriptionPlans";
import type { BillingPeriod, SubscriptionChoiceKey, SubscriptionCompanySnapshot } from "./subscription-dialog-types";
import {
  createSubscriptionIdempotencyKey,
  createTrialIdempotencyKey,
  currentSubscriptionPlanKey,
  isActivePaidSubscription,
  subscriptionChoiceRank,
} from "./subscription-dialog-utils";

export { PaymentDialog } from "./PaymentDialog";

export function SubscriptionDialog({
  billing,
  billingState = "ready",
  closeDisabled = false,
  onBillingUpdated,
  onClose,
  onGateSatisfied,
  onOpenSupport,
}: {
  billing: BillingStatus | null;
  billingState?: ApiState;
  closeDisabled?: boolean;
  onBillingUpdated?: (billing: BillingStatus) => void;
  onClose: () => void;
  onGateSatisfied?: () => void;
  onOpenSupport: () => void;
}) {
  const { token, user, refreshMe } = useAuth();
  const dialogRef = useRef<HTMLElement | null>(null);
  const [busyPlan, setBusyPlan] = useState<SubscriptionChoiceKey | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("month");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const currentCompany: SubscriptionCompanySnapshot | null = billing ?? user?.company ?? null;
  const dialogCloseDisabled = closeDisabled || busyPlan !== null;

  useAccountDialogBodyLock(true, onClose, dialogCloseDisabled);
  useAccountDialogFocusTrap(dialogRef, dialogCloseDisabled);

  const subscription = describeSubscription(currentCompany);
  const showBillingStateBanner =
    currentCompany?.status === "past_due" ||
    currentCompany?.status === "suspended" ||
    currentCompany?.status === "pending_deletion";
  const currentPlanKey: SubscriptionPlanTier["key"] | null = currentSubscriptionPlanKey(currentCompany);
  const currentPlanRank = subscriptionChoiceRank(currentPlanKey);
  const trialAlreadyUsed = Boolean(currentCompany?.demoEndsAt);
  const canChoosePlan = Boolean(token && currentCompany);

  async function activateChoice(plan: SubscriptionChoiceKey) {
    if (plan === "demo") {
      await activateTrial();
      return;
    }

    await activatePlan(plan);
  }

  async function activateTrial() {
    if (!token || busyPlan || !currentCompany || isActivePaidSubscription(currentCompany) || trialAlreadyUsed) return;
    setBusyPlan("demo");
    setMessage(null);
    setErrorMessage(null);
    try {
      await api.billing.activateTrial({
        idempotencyKey: createTrialIdempotencyKey(),
      });
      const nextBilling = await refreshBillingState();
      setMessage("Пробный доступ активирован. Можно продолжать работу.");
      onGateSatisfied?.();
      if (!closeDisabled) {
        window.setTimeout(onClose, 650);
      }
      return nextBilling;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось включить пробный доступ.");
    } finally {
      setBusyPlan(null);
    }
  }

  async function activatePlan(plan: SubscriptionPlan) {
    if (!token || busyPlan || !currentCompany) return;
    if (isActivePaidSubscription(currentCompany) && subscriptionChoiceRank(plan) <= currentPlanRank) return;
    setBusyPlan(plan);
    setMessage(null);
    setErrorMessage(null);
    try {
      await api.billing.activateSubscription(
        { plan },
        {
          idempotencyKey: createSubscriptionIdempotencyKey(plan),
        },
      );
      const nextBilling = await refreshBillingState();
      setMessage("Подписка активирована. Можно продолжать работу.");
      onGateSatisfied?.();
      if (!closeDisabled) {
        window.setTimeout(onClose, 650);
      }
      return nextBilling;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось активировать подписку.");
    } finally {
      setBusyPlan(null);
    }
  }

  async function refreshBillingState() {
    const nextBilling = await api.billing.status();
    onBillingUpdated?.(nextBilling);
    await refreshMe();
    window.dispatchEvent(new Event("notifications:changed"));
    return nextBilling;
  }

  return (
    <div
      aria-labelledby="account-subscription-dialog-title"
      aria-modal="true"
      className={`account-password-modal-backdrop${closeDisabled ? " subscription-gate-backdrop" : ""}`}
      onClick={(event) => {
        if (!dialogCloseDisabled && event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal account-subscription-modal" ref={dialogRef}>
        <header className="account-password-modal-head">
          <div>
            <span className="account-password-modal-kicker">{closeDisabled ? "Доступ к продукту" : "Подписка"}</span>
            <h2 className={closeDisabled ? undefined : "account-modal-sr-title"} id="account-subscription-dialog-title">
              {closeDisabled ? "Выберите доступ, чтобы продолжить" : "Подписка"}
            </h2>
            {closeDisabled ? (
              <p>
                Продукт уже открыт на фоне. Активируйте пробный доступ или тестовую подписку, и мы сразу разблокируем
                работу.
              </p>
            ) : null}
          </div>
          {closeDisabled ? null : (
            <button
              aria-label="Закрыть подписку"
              className="account-password-modal-close"
              disabled={busyPlan !== null}
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
          )}
        </header>
        <div className="account-subscription-modal-body account-panel-stack">
          {showBillingStateBanner && currentCompany ? (
            <div className={`account-state-banner status-${currentCompany.status}`}>
              <strong>{subscription.tariff}</strong>
              <span>{subscription.note}</span>
            </div>
          ) : null}
          {billingState === "loading" ? (
            <div className="account-state-banner">
              <strong>Проверяем статус доступа</strong>
              <span>Секунду, загружаем данные компании.</span>
            </div>
          ) : null}
          {message ? (
            <div className="account-state-banner status-active">
              <strong>Готово</strong>
              <span>{message}</span>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="account-state-banner status-suspended">
              <strong>Не получилось активировать доступ</strong>
              <span>{errorMessage}</span>
            </div>
          ) : null}
          <SubscriptionPlans
            billingPeriod={billingPeriod}
            busyPlan={busyPlan}
            canChoosePlan={canChoosePlan}
            currentCompany={currentCompany}
            currentPlanKey={currentPlanKey}
            currentPlanRank={currentPlanRank}
            onActivateChoice={activateChoice}
            setBillingPeriod={setBillingPeriod}
            trialAlreadyUsed={trialAlreadyUsed}
          />
          <div className="account-subscription-help">
            <span>Нужна помощь с доступом?</span>
            <button className="button ghost" onClick={onOpenSupport} type="button">
              Написать в поддержку
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
