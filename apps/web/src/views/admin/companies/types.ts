import type { AdminCompanyDetail, AdminCompanyListItem, PaginatedResponse } from "@ecoplatform/shared";

// Каноничные типы ответов — в shared (api-response.ts); реэкспортируем под
// привычными именами, чтобы не трогать импорты компонентов домена.
export type { AdminCompanyDetail, AdminCompanyListItem };

export type AdminCompanyList = PaginatedResponse<AdminCompanyListItem>;
export type CompanySortKey = "name" | "status" | "plan" | "users" | "tickets" | "subscriptions" | "createdAt";

export type CompanyStatusFilter = "" | (typeof import("@ecoplatform/shared").companyStatuses)[number];
export type CompanyPlanFilter = "" | (typeof import("@ecoplatform/shared").subscriptionPlans)[number];

export type CompanyFilters = {
  search: string;
  status: CompanyStatusFilter;
  plan: CompanyPlanFilter;
};
