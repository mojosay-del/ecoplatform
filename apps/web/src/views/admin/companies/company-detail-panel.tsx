import type { FormEvent } from "react";
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
}: AdminCompanyDetailPanelProps) {
  return (
    <div className="moderation-detail">
      {!selected ? (
        <p className="page-subtitle">Выберите компанию.</p>
      ) : (
        <>
          <CompanySummary company={selected} />
          <CompanyUsersSection company={selected} />
          <CompanySubscriptionsSection company={selected} />
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

function CompanySummary({ company }: { company: AdminCompanyDetail }) {
  return (
    <div className="list-row">
      <div>
        <StatusPill as="p" variant={companyStatusPillVariant(company.status)}>
          {COMPANY_STATUS_LABELS[company.status] ?? company.status}
        </StatusPill>
        <h2>{company.organizationName}</h2>
        <p className="page-subtitle">
          {company.subscriptionPlan
            ? (SUBSCRIPTION_PLAN_LABELS[company.subscriptionPlan] ?? company.subscriptionPlan)
            : "Без активного тарифа"}
          {company.subscriptionEndsAt
            ? ` · до ${new Date(company.subscriptionEndsAt).toLocaleDateString("ru-RU")}`
            : ""}
        </p>
      </div>
    </div>
  );
}

function CompanyUsersSection({ company }: { company: AdminCompanyDetail }) {
  return (
    <section>
      <h3>Пользователи ({company.users.length})</h3>
      <div className="stack-list">
        {company.users.map((user) => (
          <article className="checklist-block" key={user.id}>
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
    </section>
  );
}

function CompanySubscriptionsSection({ company }: { company: AdminCompanyDetail }) {
  return (
    <section>
      <h3>Подписки</h3>
      {company.subscriptions.length === 0 ? (
        <p className="page-subtitle">Нет.</p>
      ) : (
        <div className="stack-list">
          {company.subscriptions.map((subscription) => (
            <article className="checklist-block" key={subscription.id}>
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
    <section>
      <h3>Последние тикеты</h3>
      {company.supportTickets.length === 0 ? (
        <p className="page-subtitle">Нет.</p>
      ) : (
        <div className="stack-list">
          {company.supportTickets.map((ticket) => (
            <article className="checklist-block" key={ticket.id}>
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
