// Типизированные ручки админ-панели: подписки, сотрудники, компании, пользователи.
// URL и query собираются здесь (не в 4 вьюхах), типы ответов — из shared.
import type {
  AdminBillingCompanyItem,
  AdminBillingSummary,
  AdminCompanyDetail,
  AdminCompanyListItem,
  AdminStaffItem,
  AdminUserDetail,
  AdminUserListItem,
  BillingSubscriptionActivationResponse,
  PaginatedResponse,
} from "@ecoplatform/shared";
import { apiFetch } from "./requests";
import { enc, type ApiRequestOptions, type PaginationInput } from "./endpoint-utils";

// Общий сборщик query: пагинация + произвольные строковые фильтры
// (пустые/whitespace значения опускаются).
function adminListSuffix(pagination: PaginationInput, filters: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams();
  if (pagination.limit !== undefined) query.set("limit", String(pagination.limit));
  if (pagination.offset !== undefined) query.set("offset", String(pagination.offset));
  for (const [key, value] of Object.entries(filters)) {
    if (value && value.trim()) query.set(key, value.trim());
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export const adminBillingApi = {
  companies: (pagination: PaginationInput = {}, filters: { search?: string } = {}) =>
    apiFetch<PaginatedResponse<AdminBillingCompanyItem>>(
      `/admin/billing/companies${adminListSuffix(pagination, { search: filters.search })}`,
    ),
  summary: () => apiFetch<AdminBillingSummary>("/admin/billing/summary"),
  activateManualSubscription: (
    body: { companyId: string; plan: string; endsAt: string; reason: string },
    idempotencyKey: string,
  ) =>
    apiFetch<BillingSubscriptionActivationResponse>("/admin/billing/manual-subscriptions", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body,
    }),
};

export const adminStaffApi = {
  list: (pagination: PaginationInput = {}, options: ApiRequestOptions = {}) =>
    apiFetch<PaginatedResponse<AdminStaffItem>>(`/admin/staff${adminListSuffix(pagination)}`, { token: options.token }),
  create: (
    body: {
      email: string;
      phone: string;
      firstName: string;
      lastName: string;
      gender: "male" | "female" | null;
      password: string;
      roles: string[];
    },
    options: ApiRequestOptions = {},
  ) => apiFetch<AdminStaffItem>("/admin/staff", { method: "POST", token: options.token, body }),
  update: (userId: string, patch: { roles?: string[]; isActive?: boolean }, options: ApiRequestOptions = {}) =>
    apiFetch<AdminStaffItem>(`/admin/staff/${enc(userId)}`, { method: "PATCH", token: options.token, body: patch }),
  resetPassword: (userId: string, password: string, options: ApiRequestOptions = {}) =>
    apiFetch<{ ok: true }>(`/admin/staff/${enc(userId)}/reset-password`, {
      method: "POST",
      token: options.token,
      body: { password },
    }),
};

export const adminCompaniesApi = {
  list: (
    pagination: PaginationInput = {},
    filters: { search?: string; status?: string; plan?: string } = {},
    options: ApiRequestOptions = {},
  ) =>
    apiFetch<PaginatedResponse<AdminCompanyListItem>>(`/admin/companies${adminListSuffix(pagination, filters)}`, {
      token: options.token,
    }),
  get: (companyId: string, options: ApiRequestOptions = {}) =>
    apiFetch<AdminCompanyDetail>(`/admin/companies/${enc(companyId)}`, { token: options.token }),
  setStatus: (
    companyId: string,
    body: { status: string; reasonCode: string; comment?: string },
    options: ApiRequestOptions = {},
  ) =>
    apiFetch<AdminCompanyDetail>(`/admin/companies/${enc(companyId)}/status`, {
      method: "POST",
      token: options.token,
      body,
    }),
};

export const adminUsersApi = {
  list: (
    pagination: PaginationInput = {},
    filters: { search?: string; status?: string } = {},
    options: ApiRequestOptions = {},
  ) =>
    apiFetch<PaginatedResponse<AdminUserListItem>>(`/admin/users${adminListSuffix(pagination, filters)}`, {
      token: options.token,
    }),
  get: (userId: string, options: ApiRequestOptions = {}) =>
    apiFetch<AdminUserDetail>(`/admin/users/${enc(userId)}`, { token: options.token }),
  block: (userId: string, body: { reasonCode: string; comment?: string }, options: ApiRequestOptions = {}) =>
    apiFetch<AdminUserDetail>(`/admin/users/${enc(userId)}/block`, { method: "POST", token: options.token, body }),
  unblock: (userId: string, body: { comment?: string }, options: ApiRequestOptions = {}) =>
    apiFetch<AdminUserDetail>(`/admin/users/${enc(userId)}/unblock`, { method: "POST", token: options.token, body }),
  setPlatformRoles: (userId: string, body: { roles: string[]; isActive: boolean }, options: ApiRequestOptions = {}) =>
    apiFetch<AdminUserDetail>(`/admin/users/${enc(userId)}/platform-roles`, {
      method: "PATCH",
      token: options.token,
      body,
    }),
};
