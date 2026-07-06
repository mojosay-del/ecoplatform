import { CreditCard, FileText, X } from "lucide-react";
import type { BillingStatus, BillingSubscription } from "@ecoplatform/shared";
import { AnimatedNavIcon } from "../../components/app-shell/nav-icons";
import { StatusPill, subscriptionStatusPillVariant } from "../../components/StatusPill";
import { SUBSCRIPTION_PLAN_TITLE_LABELS, SUBSCRIPTION_STATUS_LABELS } from "../../lib/display-labels";
import type { ApiState } from "../shared/use-api-query";
import { formatAccountDate } from "./format";
import { useAccountDialogBodyLock } from "./hooks";

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
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по фону — мышиное удобство; с клавиатуры окно закрывается кнопкой закрытия и Escape
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
          <span aria-hidden="true" className="account-modal-icon account-stat-brand">
            <AnimatedNavIcon name="docs" size={22} />
          </span>
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
