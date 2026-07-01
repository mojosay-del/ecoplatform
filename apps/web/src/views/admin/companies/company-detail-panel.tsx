import type { FormEvent } from "react";
import { Building2, CreditCard, LifeBuoy, Users } from "lucide-react";
import {
  StatusPill,
  companyStatusPillVariant,
  subscriptionStatusPillVariant,
  supportStatusPillVariant,
  userStatusPillVariant,
} from "../../../components/StatusPill";
import {
  COMPANY_STATUS_LABELS,
  SUBSCRIPTION_PLAN_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  USER_STATUS_LABELS,
} from "../../../lib/display-labels";
import { CompanyStatusForm } from "./company-status-form";
import { CompanySubscriptionActivationForm } from "./company-subscription-form";
import type { CompanyStatusReason } from "./constants";
import type { AdminCompanyDetail } from "./types";

type AdminCompanyDetailPanelProps = {
  selected: AdminCompanyDetail | null;
  nextStatus: string;
  statusReason: CompanyStatusReason;
  statusComment: string;
  onNextStatusChange: (value: string) => void;
  onStatusReasonChange: (value: CompanyStatusReason) => void;
  onStatusCommentChange: (value: string) => void;
  onSubmitStatus: (event: FormEvent<HTMLFormElement>) => void;
  onSubscriptionActivated: () => void;
};

export function AdminCompanyDetailPanel({
  selected,
  nextStatus,
  statusReason,
  statusComment,
  onNextStatusChange,
  onStatusReasonChange,
  onStatusCommentChange,
  onSubmitStatus,
  onSubscriptionActivated,
}: AdminCompanyDetailPanelProps) {
  return (
    <div className="moderation-detail admin-user-detail">
      {!selected ? (
        <p className="page-subtitle auser-empty">Выберите компанию, чтобы увидеть профиль, пользователей и подписки.</p>
      ) : (
        <>
          <header className="auser-head">
            <div className="auser-avatar" aria-hidden="true">
              <Building2 size={20} />
            </div>
            <div className="auser-id">
              <StatusPill variant={companyStatusPillVariant(selected.status)}>
                {COMPANY_STATUS_LABELS[selected.status] ?? selected.status}
              </StatusPill>
              <h2 className="auser-name">{selected.organizationName}</h2>
              <p className="auser-contacts">
                {selected.subscriptionPlan
                  ? (SUBSCRIPTION_PLAN_LABELS[selected.subscriptionPlan] ?? selected.subscriptionPlan)
                  : "Без активного тарифа"}
                {selected.subscriptionEndsAt
                  ? ` · до ${new Date(selected.subscriptionEndsAt).toLocaleDateString("ru-RU")}`
                  : ""}
              </p>
            </div>
          </header>

          <CompanyUsersSection company={selected} />
          <CompanySubscriptionsSection company={selected} />
          <CompanySubscriptionActivationForm companyId={selected.id} onActivated={onSubscriptionActivated} />
          <CompanySupportTicketsSection company={selected} />
          <CompanyStatusForm
            nextStatus={nextStatus}
            statusReason={statusReason}
            statusComment={statusComment}
            onNextStatusChange={onNextStatusChange}
            onStatusReasonChange={onStatusReasonChange}
            onStatusCommentChange={onStatusCommentChange}
            onSubmit={onSubmitStatus}
          />
        </>
      )}
    </div>
  );
}

function CompanyUsersSection({ company }: { company: AdminCompanyDetail }) {
  return (
    <section className="auser-section">
      <div className="auser-section-head">
        <Users aria-hidden size={15} />
        <span>Пользователи ({company.users.length})</span>
      </div>
      {company.users.length === 0 ? (
        <p className="auser-muted">Нет пользователей.</p>
      ) : (
        <div className="stack-list">
          {company.users.map((user) => (
            <article className="auser-restriction" key={user.id}>
              <strong>
                {user.firstName} {user.lastName}
              </strong>
              <p>
                {user.email} ·{" "}
                <StatusPill variant={userStatusPillVariant(user.status)}>
                  {USER_STATUS_LABELS[user.status] ?? user.status}
                </StatusPill>
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CompanySubscriptionsSection({ company }: { company: AdminCompanyDetail }) {
  return (
    <section className="auser-section">
      <div className="auser-section-head">
        <CreditCard aria-hidden size={15} />
        <span>Подписки</span>
      </div>
      {company.subscriptions.length === 0 ? (
        <p className="auser-muted">Нет.</p>
      ) : (
        <div className="stack-list">
          {company.subscriptions.map((subscription) => (
            <article className="auser-restriction" key={subscription.id}>
              <strong>
                {SUBSCRIPTION_PLAN_LABELS[subscription.plan] ?? subscription.plan} ·{" "}
                <StatusPill variant={subscriptionStatusPillVariant(subscription.status)}>
                  {SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status}
                </StatusPill>
              </strong>
              <p>
                {new Date(subscription.startsAt).toLocaleDateString("ru-RU")} →{" "}
                {new Date(subscription.endsAt).toLocaleDateString("ru-RU")}
              </p>
              {subscription.reason ? <small>{subscription.reason}</small> : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CompanySupportTicketsSection({ company }: { company: AdminCompanyDetail }) {
  return (
    <section className="auser-section">
      <div className="auser-section-head">
        <LifeBuoy aria-hidden size={15} />
        <span>Последние тикеты</span>
      </div>
      {company.supportTickets.length === 0 ? (
        <p className="auser-muted">Нет.</p>
      ) : (
        <div className="stack-list">
          {company.supportTickets.map((ticket) => (
            <article className="auser-restriction" key={ticket.id}>
              <strong>{ticket.subject}</strong>
              <p>
                {SUPPORT_CATEGORY_LABELS[ticket.category] ?? ticket.category} ·{" "}
                <StatusPill variant={supportStatusPillVariant(ticket.status)}>
                  {SUPPORT_STATUS_LABELS[ticket.status] ?? ticket.status}
                </StatusPill>
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
