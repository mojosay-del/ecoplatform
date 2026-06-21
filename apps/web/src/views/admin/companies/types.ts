import type { PaginatedResponse } from "@ecoplatform/shared";

export type AdminCompanyListItem = {
  id: string;
  organizationName: string;
  status: string;
  subscriptionPlan: string | null;
  subscriptionEndsAt: string | null;
  demoEndsAt: string | null;
  createdAt: string;
  _count: { users: number; subscriptions: number; supportTickets: number };
};

export type AdminCompanyList = PaginatedResponse<AdminCompanyListItem>;
export type CompanySortKey = "name" | "status" | "plan" | "users" | "tickets" | "subscriptions" | "createdAt";

export type AdminCompanyDetail = {
  id: string;
  organizationName: string;
  status: string;
  subscriptionPlan: string | null;
  subscriptionEndsAt: string | null;
  demoEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
  users: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    createdAt: string;
  }>;
  subscriptions: Array<{
    id: string;
    plan: string;
    status: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
  }>;
  supportTickets: Array<{
    id: string;
    category: string;
    subject: string;
    status: string;
    createdAt: string;
  }>;
};

export type CompanyStatusFilter = "" | (typeof import("@ecoplatform/shared").companyStatuses)[number];
export type CompanyPlanFilter = "" | (typeof import("@ecoplatform/shared").subscriptionPlans)[number];

export type CompanyFilters = {
  search: string;
  status: CompanyStatusFilter;
  plan: CompanyPlanFilter;
};
