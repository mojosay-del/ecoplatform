// Типизированные ручки операционных разделов админки: поддержка, рассылка,
// настройки, журналы, модерация. URL и query собираются здесь, типы — из shared.
import type {
  AdminJournalEntry,
  AdminSettingItem,
  AdminSupportTicket,
  ModerationCaseDetail,
  ModerationCaseListItem,
  PaginatedResponse,
} from "@ecoplatform/shared";
import { apiFetch } from "./requests";
import { enc, type ApiRequestOptions, type PaginationInput } from "./endpoint-utils";

function listSuffix(pagination: PaginationInput, filters: Record<string, string | undefined> = {}) {
  const query = new URLSearchParams();
  if (pagination.limit !== undefined) query.set("limit", String(pagination.limit));
  if (pagination.offset !== undefined) query.set("offset", String(pagination.offset));
  for (const [key, value] of Object.entries(filters)) {
    if (value && value.trim()) query.set(key, value.trim());
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

// Аудитория рассылки (фильтры выборки получателей).
type BroadcastAudience = {
  companyType?: string;
  subscriptionPlan?: string;
  gender?: string;
  companyRole?: string;
  includeBlocked?: boolean;
};

export const adminSupportApi = {
  tickets: (pagination: PaginationInput = {}, options: ApiRequestOptions = {}) =>
    apiFetch<PaginatedResponse<AdminSupportTicket>>(`/admin/support/tickets${listSuffix(pagination)}`, {
      token: options.token,
    }),
  reply: (ticketId: string, text: string, options: ApiRequestOptions = {}) =>
    apiFetch<{ ok: true }>(`/admin/support/tickets/${enc(ticketId)}/replies`, {
      method: "POST",
      token: options.token,
      body: { text },
    }),
};

export const adminBroadcastApi = {
  recipientsCount: (audience: BroadcastAudience, options: ApiRequestOptions = {}) =>
    apiFetch<{ recipientCount: number }>("/admin/broadcast/recipients-count", {
      method: "POST",
      token: options.token,
      body: { audience },
    }),
  send: (
    body: { title: string; body: string; link?: string; audience: BroadcastAudience },
    options: ApiRequestOptions = {},
  ) => apiFetch<{ recipientCount: number }>("/admin/broadcast", { method: "POST", token: options.token, body }),
};

export const adminSettingsApi = {
  list: () => apiFetch<AdminSettingItem[]>("/admin/settings"),
  update: (key: string, value: number | boolean) =>
    apiFetch<{ ok: true }>(`/admin/settings/${enc(key)}`, { method: "PATCH", body: { value } }),
};

export const adminJournalsApi = {
  list: (
    pagination: PaginationInput = {},
    filters: { action?: string; entityType?: string; actorId?: string; from?: string; to?: string } = {},
    options: ApiRequestOptions = {},
  ) =>
    apiFetch<PaginatedResponse<AdminJournalEntry>>(`/admin/journals${listSuffix(pagination, filters)}`, {
      token: options.token,
    }),
};

export const adminModerationApi = {
  cases: (pagination: PaginationInput = {}, filters: { status?: string } = {}) =>
    apiFetch<PaginatedResponse<ModerationCaseListItem>>(`/admin/moderation/cases${listSuffix(pagination, filters)}`),
  case: (caseId: string) => apiFetch<ModerationCaseDetail>(`/admin/moderation/cases/${enc(caseId)}`),
  lock: (caseId: string) =>
    apiFetch<ModerationCaseDetail>(`/admin/moderation/cases/${enc(caseId)}/lock`, { method: "POST" }),
  release: (caseId: string) =>
    apiFetch<ModerationCaseDetail>(`/admin/moderation/cases/${enc(caseId)}/release`, { method: "POST" }),
  decide: (caseId: string, body: { type: string; reasonCode: string; comment?: string }) =>
    apiFetch<ModerationCaseDetail>(`/admin/moderation/cases/${enc(caseId)}/decisions`, { method: "POST", body }),
  applyAdminSanction: (
    caseId: string,
    body: { type: string; reasonCode: string; comment?: string; moduleCode?: string; durationDays?: number },
  ) => apiFetch<{ ok: true }>(`/admin/moderation/cases/${enc(caseId)}/admin-sanctions`, { method: "POST", body }),
  liftSanction: (sanctionId: string, body: { reasonCode: string; comment: string }) =>
    apiFetch<{ ok: true }>(`/admin/moderation/sanctions/${enc(sanctionId)}/lift`, { method: "POST", body }),
};
