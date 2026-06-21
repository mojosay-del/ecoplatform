import type {
  AccountContactChangeApplyDto,
  AccountContactChangeStartDto,
  AccountContactChangeVerifyDto,
  AccountProfileUpdateDto,
  AuthMeUser,
  BillingStatus,
  BillingSubscriptionActivationResponse,
  BillingTrialActivationResponse,
  CompanyProfileUpdateDto,
  ConsentRecordItem,
  ConsentSource,
  LegalDocumentDetail,
  LegalDocumentSummary,
  LegalDocumentType,
  PaginatedResponse,
  SelfSubscriptionDto,
  TripCalculatorSettings,
  TripCalculatorSettingsGetResponse,
} from "@ecoplatform/shared";
import type { FileAsset } from "./file-assets";
import { enc, paginationSuffix, type PaginationInput } from "./endpoint-utils";
import { apiDownload, apiFetch } from "./requests";

export type AccountDeletionStatus = {
  ok: true;
  deletionRequestedAt: string | null;
  deletionScheduledFor: string | null;
};

type AuthSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  rememberMe: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  current: boolean;
};

export type NotificationItem = {
  id: string;
  category: string;
  eventType: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

type NotificationPreferences = {
  inAppMutedCategories: string[];
  emailMutedCategories: string[];
};

type SupportTicket = {
  id: string;
  category: string;
  subject: string;
  status: string;
  updatedAt: string;
  createdAt: string;
  messages?: Array<{
    id: string;
    text: string;
    authorRole: string;
    createdAt: string;
    isInternal: boolean;
  }>;
};

export const accountApi = {
  updateProfile: (input: AccountProfileUpdateDto) =>
    apiFetch<AuthMeUser>("/account/profile", { method: "PATCH", body: input }),
  startContactChange: (input: AccountContactChangeStartDto) =>
    apiFetch<{ verificationId: string; email: string; expiresAt: string }>("/account/contact-change/start", {
      method: "POST",
      body: input,
    }),
  verifyContactChange: (input: AccountContactChangeVerifyDto) =>
    apiFetch<{ ok: true }>("/account/contact-change/verify", { method: "POST", body: input }),
  // M-9: для email apply не применяет адрес сразу, а отправляет код на НОВЫЙ
  // адрес и просит подтвердить владение (requiresNewCode). Телефон применяется
  // сразу (requiresNewCode: false).
  applyContactChange: (input: AccountContactChangeApplyDto) =>
    apiFetch<
      | { requiresNewCode: true; verificationId: string; email: string; expiresAt: string }
      | { requiresNewCode: false; user: AuthMeUser }
    >("/account/contact-change/apply", { method: "POST", body: input }),
  confirmContactChange: (input: AccountContactChangeVerifyDto) =>
    apiFetch<AuthMeUser>("/account/contact-change/confirm", { method: "POST", body: input }),
  // fileId — id уже загруженного через api.files.upload публичного изображения.
  setAvatar: (fileId: string) => apiFetch<AuthMeUser>("/account/avatar", { method: "POST", body: { fileId } }),
  removeAvatar: () => apiFetch<AuthMeUser>("/account/avatar", { method: "DELETE" }),
};

export const tripCalculatorApi = {
  getSettings: () =>
    apiFetch<TripCalculatorSettingsGetResponse>("/trip-calculator/settings").then((response) => response.settings),
  saveSettings: (settings: TripCalculatorSettings) =>
    apiFetch<TripCalculatorSettings>("/trip-calculator/settings", { method: "PATCH", body: settings }),
};

export const billingApi = {
  status: () => apiFetch<BillingStatus>("/billing/status"),
  updateCompanyProfile: (input: CompanyProfileUpdateDto) =>
    apiFetch<BillingStatus>("/billing/company", { method: "PATCH", body: input }),
  activateSubscription: (input: SelfSubscriptionDto, options: { idempotencyKey: string }) =>
    apiFetch<BillingSubscriptionActivationResponse>("/billing/subscriptions", {
      method: "POST",
      body: input,
      headers: { "Idempotency-Key": options.idempotencyKey },
    }),
  activateTrial: (options: { idempotencyKey: string }) =>
    apiFetch<BillingTrialActivationResponse>("/billing/trial", {
      method: "POST",
      headers: { "Idempotency-Key": options.idempotencyKey },
    }),
};

export const authApi = {
  // Публично: открыта ли само-регистрация (тумблер в админке).
  registrationStatus: () => apiFetch<{ enabled: boolean }>("/auth/registration"),
  listSessions: () => apiFetch<AuthSession[]>("/auth/sessions"),
  revokeSession: (sessionId: string) =>
    apiFetch<{ revokedCurrent: boolean }>(`/auth/sessions/${enc(sessionId)}/revoke`, { method: "POST" }),
  logoutAll: () => apiFetch<{ ok: true }>("/auth/sessions/logout-all", { method: "POST" }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    apiFetch<{ ok: true }>("/auth/change-password", { method: "POST", body }),
  exportData: () => apiDownload("/auth/me/export-data", { method: "POST" }),
  requestDeletion: () => apiFetch<AccountDeletionStatus>("/auth/me/request-deletion", { method: "POST" }),
  cancelDeletion: () => apiFetch<AccountDeletionStatus>("/auth/me/cancel-deletion", { method: "POST" }),
};

export const notificationsApi = {
  list: (pagination: PaginationInput = {}) =>
    apiFetch<PaginatedResponse<NotificationItem>>(`/notifications${paginationSuffix(pagination)}`),
  unreadCount: () => apiFetch<{ count: number }>("/notifications/unread-count"),
  markRead: (id: string) => apiFetch<{ ok: true }>(`/notifications/${enc(id)}/read`, { method: "POST" }),
  markAllRead: () => apiFetch<{ ok: true }>("/notifications/read-all", { method: "POST" }),
  archive: (id: string) => apiFetch<{ ok: true }>(`/notifications/${enc(id)}/archive`, { method: "POST" }),
  preferences: {
    get: () => apiFetch<NotificationPreferences>("/notifications/preferences"),
    update: (body: { inAppMutedCategories?: string[]; emailMutedCategories?: string[] }) =>
      apiFetch<NotificationPreferences>("/notifications/preferences", {
        method: "PATCH",
        body,
      }),
  },
};

export const supportApi = {
  // Envelope: `{ items, total, hasMore }`. У account-view нужны только
  // первые 4 (через .slice), drawer показывает весь список (default 50,
  // max 200). Сами messages сохранены в выдаче — UI рендерит thread без
  // отдельного /tickets/:id-запроса.
  listMyTickets: (pagination: PaginationInput = {}) =>
    apiFetch<PaginatedResponse<SupportTicket>>(`/support/tickets${paginationSuffix(pagination)}`),
  createTicket: (body: { category: string; subject: string; text: string }) =>
    apiFetch<SupportTicket>("/support/tickets", { method: "POST", body }),
  replyToTicket: (id: string, body: { text: string }) =>
    apiFetch<{ ok: true }>(`/support/tickets/${enc(id)}/replies`, { method: "POST", body }),
};

export const moderationApi = {
  createComplaint: (body: {
    entityType:
      | "news_comment"
      | "news_post"
      | "knowledge_base_article"
      | "marketplace_listing"
      | "marketplace_review"
      | "forum_question"
      | "forum_answer";
    entityId: string;
    reasonCode: string;
    comment?: string;
  }) => apiFetch<{ id: string }>("/moderation/complaints", { method: "POST", body }),
};

export const filesApi = {
  listByIds: (ids: string[]) => apiFetch<FileAsset[]>(`/files?ids=${enc(ids.join(","))}`),
};

export const legalApi = {
  list: (types?: LegalDocumentType[]) => {
    const suffix = types && types.length ? `?types=${enc(types.join(","))}` : "";
    return apiFetch<LegalDocumentSummary[]>(`/legal/documents${suffix}`);
  },
  get: (type: LegalDocumentType, version: string) =>
    apiFetch<LegalDocumentDetail>(`/legal/documents/${enc(type)}/${enc(version)}`),
  submitConsents: (documentIds: string[], source: ConsentSource = "settings") =>
    apiFetch<{ ok: true }>("/legal/consents", { method: "POST", body: { documentIds, source } }),
  listMyConsents: () => apiFetch<ConsentRecordItem[]>("/legal/me/consents"),
};
