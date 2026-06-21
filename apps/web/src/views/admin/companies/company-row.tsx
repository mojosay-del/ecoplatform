import { StatusPill, companyStatusPillVariant } from "../../../components/StatusPill";
import { COMPANY_STATUS_LABELS, SUBSCRIPTION_PLAN_LABELS } from "../../../lib/display-labels";
import type { AdminCompanyListItem } from "./types";

type AdminCompanyRowProps = {
  company: AdminCompanyListItem;
  isActive: boolean;
  onOpen: (id: string) => void;
};

export function AdminCompanyRow({ company, isActive, onOpen }: AdminCompanyRowProps) {
  return (
    <tr className={isActive ? "active" : ""}>
      <td>
        <div className="admin-table-cell-main">
          <button className="admin-row-button" onClick={() => onOpen(company.id)} type="button">
            {company.organizationName}
          </button>
          <span className="admin-table-muted">Детали справа</span>
        </div>
      </td>
      <td>
        <StatusPill variant={companyStatusPillVariant(company.status)}>
          {COMPANY_STATUS_LABELS[company.status] ?? company.status}
        </StatusPill>
      </td>
      <td>
        {company.subscriptionPlan
          ? (SUBSCRIPTION_PLAN_LABELS[company.subscriptionPlan] ?? company.subscriptionPlan)
          : "Без тарифа"}
      </td>
      <td>{company._count.users}</td>
      <td>{company._count.supportTickets}</td>
      <td>{company._count.subscriptions}</td>
      <td>{new Date(company.createdAt).toLocaleDateString("ru-RU")}</td>
    </tr>
  );
}
