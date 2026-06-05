import { Check, CreditCard, FileText, X } from "lucide-react";
import type { BillingStatus, BillingSubscription } from "@ecoplatform/shared";
import { StatusPill, companyStatusPillVariant, subscriptionStatusPillVariant } from "../../components/StatusPill";
import {
  COMPANY_STATUS_LABELS,
  SUBSCRIPTION_PLAN_TITLE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from "../../lib/display-labels";
import { SUBSCRIPTION_PLAN_TIERS, type SubscriptionPlanTier } from "../../lib/subscription-plans";
import { describeSubscription, formatAccountDate } from "./format";
import { useAccountDialogBodyLock } from "./hooks";

export function SubscriptionDialog({
  billing,
  onClose,
  onOpenSupport,
}: {
  billing: BillingStatus | null;
  onClose: () => void;
  onOpenSupport: () => void;
}) {
  useAccountDialogBodyLock(true, onClose);

  const subscription = describeSubscription(billing);
  const companyStatusLabel = billing?.status ? (COMPANY_STATUS_LABELS[billing.status] ?? billing.status) : null;
  const showBillingStateBanner =
    billing?.status === "past_due" || billing?.status === "suspended" || billing?.status === "pending_deletion";
  const currentPlanKey: SubscriptionPlanTier["key"] =
    billing?.status === "active" && billing?.subscriptionPlan === "extended"
      ? "extended"
      : billing?.status === "active" && billing?.subscriptionPlan === "basic"
        ? "basic"
        : "demo";

  return (
    <div
      aria-labelledby="account-subscription-dialog-title"
      aria-modal="true"
      className="account-password-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal account-subscription-modal">
        <header className="account-password-modal-head">
          <div>
            <span className="account-password-modal-kicker">Подписка</span>
            <h2 id="account-subscription-dialog-title">Тариф и история</h2>
            <p>Текущий план, доступные тарифы и история подписок.</p>
          </div>
          <button
            aria-label="Закрыть подписку"
            className="account-password-modal-close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="account-subscription-modal-body account-panel-stack">
          {showBillingStateBanner && billing ? (
            <div className={`account-state-banner status-${billing.status}`}>
              <strong>{subscription.tariff}</strong>
              <span>{subscription.note}</span>
            </div>
          ) : null}
          <div className="account-plan-current">
            <div className="account-plan-current-main">
              <span className="account-plan-current-icon">
                <CreditCard size={26} />
              </span>
              <div>
                <span className="account-plan-current-label">Текущий план</span>
                <strong className="account-plan-current-name">{subscription.tariff}</strong>
              </div>
            </div>
            <div className="account-plan-current-side">
              {companyStatusLabel ? (
                <StatusPill variant={companyStatusPillVariant(billing?.status)}>{companyStatusLabel}</StatusPill>
              ) : null}
              <span className="account-plan-current-note">{subscription.note}</span>
            </div>
          </div>
          <div className="account-plans">
            {SUBSCRIPTION_PLAN_TIERS.map((tier) => {
              const isCurrent = tier.key === currentPlanKey;
              const popular = tier.key === "basic";
              return (
                <article
                  className={`account-plan${isCurrent ? " is-current" : ""}${popular ? " is-popular" : ""}`}
                  key={tier.key}
                >
                  {popular ? <span className="account-plan-badge">Рекомендуем</span> : null}
                  <h3 className="account-plan-name">{tier.name}</h3>
                  <p className="account-plan-desc">{tier.description}</p>
                  <div className="account-plan-price">
                    {tier.price ? (
                      <>
                        <span className="account-plan-amount">{tier.price}</span>
                        {tier.pricePeriod ? <span className="account-plan-period">{tier.pricePeriod}</span> : null}
                      </>
                    ) : (
                      <span className="account-plan-tbd">Цена скоро</span>
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
                  {isCurrent ? (
                    <button className="button secondary" type="button" disabled>
                      Текущий план
                    </button>
                  ) : (
                    <button className={popular ? "button" : "button secondary"} type="button" onClick={onOpenSupport}>
                      Оставить заявку
                    </button>
                  )}
                </article>
              );
            })}
          </div>
          <article className="card account-card">
            <h2>История подписок</h2>
            {billing?.subscriptions?.length ? (
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

export function PaymentDialog({ onClose }: { onClose: () => void }) {
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
        <div className="account-payment-modal-body">
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
        </div>
      </section>
    </div>
  );
}
