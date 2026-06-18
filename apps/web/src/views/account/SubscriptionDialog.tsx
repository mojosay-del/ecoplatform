import { useEffect, useRef, useState, type RefObject } from "react";
import { ArrowRight, Check, CreditCard, FileText, X } from "lucide-react";
import type { BillingStatus, BillingSubscription, SubscriptionPlan } from "@ecoplatform/shared";
import { StatusPill, subscriptionStatusPillVariant } from "../../components/StatusPill";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { SUBSCRIPTION_PLAN_TITLE_LABELS, SUBSCRIPTION_STATUS_LABELS } from "../../lib/display-labels";
import { SUBSCRIPTION_PLAN_TIERS, type SubscriptionPlanTier } from "../../lib/subscription-plans";
import type { ApiState } from "../shared/use-api-query";
import { describeSubscription, formatAccountDate } from "./format";
import { useAccountDialogBodyLock } from "./hooks";

type SubscriptionChoiceKey = SubscriptionPlanTier["key"];
type BillingPeriod = "month" | "year";
type SubscriptionCompanySnapshot = {
  status?: string;
  demoEndsAt?: string | null;
  subscriptionPlan?: string | null;
  subscriptionEndsAt?: string | null;
  organizationName?: string | null;
};

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
  useFocusTrap(dialogRef, dialogCloseDisabled);

  const subscription = describeSubscription(currentCompany);
  const showBillingStateBanner =
    currentCompany?.status === "past_due" ||
    currentCompany?.status === "suspended" ||
    currentCompany?.status === "pending_deletion";
  const currentPlanKey: SubscriptionPlanTier["key"] | null =
    isActivePaidSubscription(currentCompany) && currentCompany?.subscriptionPlan === "extended"
      ? "extended"
      : isActivePaidSubscription(currentCompany) && currentCompany?.subscriptionPlan === "basic"
        ? "basic"
        : isActiveTrial(currentCompany)
          ? "demo"
          : null;
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
          <div className="account-plans">
            {SUBSCRIPTION_PLAN_TIERS.map((tier) => {
              const isCurrent = tier.key === currentPlanKey;
              const popular = tier.key === "basic";
              const isTrial = tier.key === "demo";
              const pending = busyPlan === tier.key;
              const activePaidSubscription = isActivePaidSubscription(currentCompany);
              const isUpgrade = activePaidSubscription && subscriptionChoiceRank(tier.key) > currentPlanRank;
              const disabled = isTrial
                ? !canChoosePlan || activePaidSubscription || trialAlreadyUsed
                : !canChoosePlan || (activePaidSubscription && !isUpgrade);
              const disabledLabel =
                activePaidSubscription && !isUpgrade
                  ? "Подписка активна"
                  : isTrial && trialAlreadyUsed
                    ? isActiveTrial(currentCompany)
                      ? "Пробный доступ активен"
                      : "Пробный доступ использован"
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
                      <span className="account-plan-amount">{planPriceLabel(tier)}</span>
                      {planPricePeriodLabel(tier, billingPeriod) ? (
                        <span className="account-plan-period">{planPricePeriodLabel(tier, billingPeriod)}</span>
                      ) : null}
                    </span>
                    {isTrial ? null : (
                      <BillingPeriodToggle billingPeriod={billingPeriod} setBillingPeriod={setBillingPeriod} />
                    )}
                  </div>
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
                    onClick={() => void activateChoice(tier.key)}
                    type="button"
                  >
                    <span>{planButtonLabel({ currentLabel, disabledLabel, isCurrent, isUpgrade, pending, tier })}</span>
                    {!pending && !isCurrent && !disabledLabel ? <ArrowRight aria-hidden="true" size={16} /> : null}
                  </button>
                </article>
              );
            })}
          </div>
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
        <span className="account-billing-period-discount">-27%</span>
      </button>
    </div>
  );
}

function planButtonLabel({
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

function currentPlanButtonLabel(
  company: SubscriptionCompanySnapshot | null,
  currentPlanKey: SubscriptionPlanTier["key"] | null,
): string | undefined {
  const endsAt = currentPlanKey === "demo" ? company?.demoEndsAt : company?.subscriptionEndsAt;
  return endsAt ? `Действует до ${formatAccountDate(endsAt)}` : undefined;
}

function planPriceLabel(tier: SubscriptionPlanTier): string {
  return tier.price ?? "0 ₽";
}

function planPricePeriodLabel(tier: SubscriptionPlanTier, billingPeriod: BillingPeriod): string | undefined {
  if (tier.key === "demo") return tier.pricePeriod;
  return billingPeriod === "month" ? "/ месяц" : "/ год";
}

function subscriptionChoiceRank(plan: SubscriptionChoiceKey | string | null | undefined): number {
  if (plan === "demo") return 0;
  if (plan === "basic") return 1;
  if (plan === "extended") return 2;
  return -1;
}

function isActiveTrial(company: SubscriptionCompanySnapshot | null): boolean {
  if (company?.status !== "demo") return false;
  const trialEndsAt = parseDateTime(company.demoEndsAt);
  return trialEndsAt !== null && trialEndsAt > Date.now();
}

function isActivePaidSubscription(company: SubscriptionCompanySnapshot | null): boolean {
  if (company?.status !== "active" || !company.subscriptionPlan) return false;
  const subscriptionEndsAt = parseDateTime(company.subscriptionEndsAt);
  return subscriptionEndsAt !== null && subscriptionEndsAt > Date.now();
}

function createSubscriptionIdempotencyKey(plan: SubscriptionPlan): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `self-subscription-${plan}-${random}`;
}

function createTrialIdempotencyKey(): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `self-trial-${random}`;
}

function parseDateTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function useFocusTrap(containerRef: RefObject<HTMLElement | null>, closeDisabled: boolean) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const trapContainer = container;

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirst = () => {
      const first = trapContainer.querySelector<HTMLElement>(focusableSelector);
      first?.focus();
    };

    const frame = window.requestAnimationFrame(focusFirst);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusable = Array.from(trapContainer.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.offsetParent !== null,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      if (closeDisabled && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };
  }, [closeDisabled, containerRef]);
}

export function PaymentDialog({
  billing,
  billingState = "ready",
  onClose,
}: {
  billing: BillingStatus | null;
  billingState?: ApiState;
  onClose: () => void;
}) {
  useAccountDialogBodyLock(true, onClose);

  return (
    <div
      aria-labelledby="account-payment-dialog-title"
      aria-modal="true"
      className="account-password-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal account-payment-modal">
        <header className="account-password-modal-head">
          <div>
            <span className="account-password-modal-kicker">Оплата</span>
            <h2 id="account-payment-dialog-title">Платежные данные</h2>
            <p>Способы оплаты и платежные документы компании.</p>
          </div>
          <button
            aria-label="Закрыть платежные данные"
            className="account-password-modal-close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="account-payment-modal-body account-panel-stack">
          <div className="account-section-grid">
            <article className="card account-card">
              <h2>Способы оплаты</h2>
              <p className="page-subtitle">Сохранённые карты и расчётные счета для безналичной оплаты.</p>
              <div className="account-empty">
                <span className="account-empty-icon">
                  <CreditCard size={22} />
                </span>
                <div>
                  <strong>
                    Пока нет способов оплаты <span className="account-soon">Скоро</span>
                  </strong>
                  <p>Подписки активируются вручную поддержкой.</p>
                </div>
              </div>
            </article>
            <article className="card account-card">
              <h2>Документы и платежи</h2>
              <p className="page-subtitle">Счета, чеки и акты появятся рядом с каждым платежом.</p>
              <div className="account-empty">
                <span className="account-empty-icon">
                  <FileText size={22} />
                </span>
                <div>
                  <strong>Документов пока нет</strong>
                  <p>Появятся после первой оплаты подписки.</p>
                </div>
              </div>
            </article>
          </div>
          <article className="card account-card account-payment-history-card">
            <h2>История подписок</h2>
            {billingState === "loading" ? (
              <p className="page-subtitle">Загружаем историю подписок.</p>
            ) : billing?.subscriptions?.length ? (
              <div className="account-history-list">
                {billing.subscriptions.map((item: BillingSubscription) => (
                  <div className="account-history-row" key={item.id}>
                    <div>
                      <strong>{SUBSCRIPTION_PLAN_TITLE_LABELS[item.plan] ?? item.plan}</strong>
                      <span>
                        {formatAccountDate(item.startsAt)} — {formatAccountDate(item.endsAt)}
                      </span>
                    </div>
                    <StatusPill variant={subscriptionStatusPillVariant(item.status)}>
                      {SUBSCRIPTION_STATUS_LABELS[item.status] ?? item.status}
                    </StatusPill>
                  </div>
                ))}
              </div>
            ) : (
              <p className="page-subtitle">История появится после активации подписки.</p>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
