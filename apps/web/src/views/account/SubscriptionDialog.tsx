import "../../styles/account.css";
import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { BillingStatus, SubscriptionPlan } from "@ecoplatform/shared";
import { AnimatedNavIcon } from "../../components/app-shell/nav-icons";
import { errorText, api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { SubscriptionPlanTier } from "../../lib/subscription-plans";
import type { ApiState } from "../shared/use-api-query";
import { describeSubscription } from "./format";
import { useAccountDialogBodyLock, useAccountDialogFocusTrap } from "./hooks";
import { SubscriptionPlans } from "./SubscriptionPlans";
import { SubscriptionSupportForm } from "./SubscriptionSupportForm";
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
}: {
  billing: BillingStatus | null;
  billingState?: ApiState;
  closeDisabled?: boolean;
  onBillingUpdated?: (billing: BillingStatus) => void;
  onClose: () => void;
  onGateSatisfied?: () => void;
}) {
  const { token, user, refreshMe } = useAuth();
  const dialogRef = useRef<HTMLElement | null>(null);
  const [busyPlan, setBusyPlan] = useState<SubscriptionChoiceKey | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("month");
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Форма поддержки живёт внутри модалки: в gate-режиме внешний drawer
  // недоступен (он открывается под этим окном).
  const [supportOpen, setSupportOpen] = useState(false);
  const currentCompany: SubscriptionCompanySnapshot | null = billing ?? user?.company ?? null;
  // Сотрудник (member) не управляет подпиской — вместо тарифов показываем ему
  // понятное окно «обратитесь к владельцу».
  const isMember = user?.companyRole === "member";
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
      setErrorMessage(errorText(error, "Не удалось включить пробный доступ."));
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
      setErrorMessage(errorText(error, "Не удалось активировать подписку."));
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
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по фону — мышиное удобство; с клавиатуры окно закрывается кнопкой закрытия и Escape
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
          <span aria-hidden="true" className="account-modal-icon account-stat-warn">
            <AnimatedNavIcon name="subscription" size={22} />
          </span>
          <div>
            <span className="account-password-modal-kicker">{closeDisabled ? "Доступ к продукту" : "Подписка"}</span>
            <h2 className={closeDisabled ? undefined : "account-modal-sr-title"} id="account-subscription-dialog-title">
              {closeDisabled
                ? isMember
                  ? "Подписка компании неактивна"
                  : "Выберите доступ, чтобы продолжить"
                : "Подписка"}
            </h2>
            {closeDisabled ? (
              isMember ? (
                <p>
                  Подписка вашей компании неактивна. Продлить её может только владелец компании — обратитесь к нему,
                  чтобы продолжить работу.
                </p>
              ) : (
                <p>
                  Продукт уже открыт на фоне. Активируйте пробный доступ или тестовую подписку, и мы сразу разблокируем
                  работу.
                </p>
              )
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
          {isMember ? (
            <div className="account-state-banner status-suspended account-member-billing-note">
              <strong>Подпиской управляет владелец компании</strong>
              <span>
                Продлить или изменить подписку может только владелец. Как только он это сделает, доступные вам разделы
                снова откроются.
              </span>
            </div>
          ) : (
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
          )}
          <div className="account-subscription-help">
            <span>Нужна помощь с доступом?</span>
            <button
              aria-expanded={supportOpen}
              className="button ghost"
              onClick={() => setSupportOpen((open) => !open)}
              type="button"
            >
              {supportOpen ? "Скрыть форму" : "Написать в поддержку"}
            </button>
          </div>
          {supportOpen ? <SubscriptionSupportForm /> : null}
        </div>
      </section>
    </div>
  );
}
