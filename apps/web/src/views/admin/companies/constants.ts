import { companyStatuses, subscriptionPlans } from "@ecoplatform/shared";
import type { SortValue } from "../../../components/admin-table-utils";
import { COMPANY_STATUS_LABELS, SUBSCRIPTION_PLAN_LABELS } from "../../../lib/display-labels";
import type { AdminCompanyListItem, CompanySortKey } from "./types";

export const ADMIN_COMPANIES_PAGE_SIZE = 20;
export const COMPANY_STATUS_OPTIONS = companyStatuses;
export const SUBSCRIPTION_PLAN_OPTIONS = subscriptionPlans;

export const companyStatusReasons = [
  "policy_violation",
  "billing_issue",
  "support_request",
  "manual_activation",
  "manual_archive",
  "other",
] as const;

export type CompanyStatusReason = (typeof companyStatusReasons)[number];

export const companySortSelectors: Record<CompanySortKey, (item: AdminCompanyListItem) => SortValue> = {
  name: (item) => item.organizationName,
  status: (item) => COMPANY_STATUS_LABELS[item.status] ?? item.status,
  plan: (item) =>
    item.subscriptionPlan ? (SUBSCRIPTION_PLAN_LABELS[item.subscriptionPlan] ?? item.subscriptionPlan) : "",
  users: (item) => item._count.users,
  tickets: (item) => item._count.supportTickets,
  subscriptions: (item) => item._count.subscriptions,
  createdAt: (item) => Date.parse(item.createdAt),
};
