// Типизированный namespaced API-клиент. Каждый endpoint:
//  1) Строит URL внутри (никаких хардкод-строк по 42 файлам),
//  2) Привязан к response-DTO из @ecoplatform/shared,
//  3) Использует низкоуровневый apiFetch с auto-refresh и rate-limit retry.
//
// Использование: `api.news.list()` вместо `apiFetch<NewsListItem[]>("/news")`.
// При ребрендинге URL (например, `/news` → `/v2/news`) меняется одна строка
// здесь, а не 42 в views.

import type {
  BillingStatus,
  CompanyProfileUpdateDto,
  ConsentRecordItem,
  ConsentSource,
  KnowledgeArticleDetail,
  KnowledgeNode,
  LearningModuleDetail,
  LearningModuleListItem,
  LegalDocumentDetail,
  LegalDocumentSummary,
  LegalDocumentType,
  NewsListItem,
  NewsPostDetail,
  NomenclatureCategoryListItem,
  PaginatedResponse,
} from "@ecoplatform/shared";
import { apiFetch, type FileAsset } from "./core";

// Лайки и комментарии возвращают одинаковую полезную нагрузку — выносим.
export type LikeResult = {
  liked: boolean;
  likesCount: number;
};

function enc(value: string): string {
  // encodeURIComponent для всех динамических сегментов URL: пользовательский
  // slug / id могут содержать спецсимволы. Раньше эта обёртка использовалась
  // непоследовательно.
  return encodeURIComponent(value);
}

export const api = {
  // ── Новости ─────────────────────────────────────────────────────────────
  news: {
    list: (pagination: { limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams();
      if (pagination.limit !== undefined) query.set("limit", String(pagination.limit));
      if (pagination.offset !== undefined) query.set("offset", String(pagination.offset));
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return apiFetch<PaginatedResponse<NewsListItem>>(`/news${suffix}`);
    },
    get: (slug: string) => apiFetch<NewsPostDetail>(`/news/${enc(slug)}`),
    like: (id: string) => apiFetch<LikeResult>(`/news/${enc(id)}/like`, { method: "POST" }),
    addComment: (postId: string, body: { text: string; parentCommentId?: string }) =>
      apiFetch<{ id: string }>(`/news/${enc(postId)}/comments`, { method: "POST", body }),
    likeComment: (commentId: string) =>
      apiFetch<LikeResult>(`/news/comments/${enc(commentId)}/like`, { method: "POST" }),
  },

  // ── Индексы цен ─────────────────────────────────────────────────────────
  indices: {
    list: () => apiFetch<NomenclatureCategoryListItem[]>("/indices"),
  },

  // ── Обучение ────────────────────────────────────────────────────────────
  learning: {
    listModules: () => apiFetch<LearningModuleListItem[]>("/education/modules"),
    getModule: (id: string) => apiFetch<LearningModuleDetail>(`/education/modules/${enc(id)}`),
    completeLesson: (lessonId: string) =>
      apiFetch<{ ok: true }>(`/education/lessons/${enc(lessonId)}/complete`, { method: "POST" }),
  },

  // ── База знаний ─────────────────────────────────────────────────────────
  knowledgeBase: {
    tree: () => apiFetch<KnowledgeNode[]>("/knowledge-base"),
    getArticle: (slug: string) => apiFetch<KnowledgeArticleDetail>(`/knowledge-base/${enc(slug)}`),
  },

  // ── Биллинг / кабинет ───────────────────────────────────────────────────
  billing: {
    status: () => apiFetch<BillingStatus>("/billing/status"),
    updateCompanyProfile: (input: CompanyProfileUpdateDto) =>
      apiFetch<BillingStatus>("/billing/company", { method: "PATCH", body: input }),
  },

  // ── Аутентификация / сессии ────────────────────────────────────────────
  auth: {
    listSessions: () =>
      apiFetch<
        Array<{
          id: string;
          userAgent: string | null;
          ipAddress: string | null;
          rememberMe: boolean;
          expiresAt: string;
          createdAt: string;
          updatedAt: string;
          current: boolean;
        }>
      >("/auth/sessions"),
    revokeSession: (sessionId: string) =>
      apiFetch<{ revokedCurrent: boolean }>(`/auth/sessions/${enc(sessionId)}/revoke`, { method: "POST" }),
    logoutAll: () => apiFetch<{ ok: true }>("/auth/sessions/logout-all", { method: "POST" }),
    changePassword: (body: { currentPassword: string; newPassword: string }) =>
      apiFetch<{ ok: true }>("/auth/change-password", { method: "POST", body }),
  },

  // ── Уведомления ─────────────────────────────────────────────────────────
  notifications: {
    preferences: {
      get: () =>
        apiFetch<{ inAppMutedCategories: string[]; emailMutedCategories: string[] }>("/notifications/preferences"),
      update: (body: { inAppMutedCategories?: string[]; emailMutedCategories?: string[] }) =>
        apiFetch<{ inAppMutedCategories: string[]; emailMutedCategories: string[] }>("/notifications/preferences", {
          method: "PATCH",
          body,
        }),
    },
  },

  // ── Поддержка ───────────────────────────────────────────────────────────
  support: {
    // Envelope: `{ items, total, hasMore }`. У account-view нужны только
    // первые 4 (через .slice), drawer показывает весь список (default 50,
    // max 200). Сами messages сохранены в выдаче — UI рендерит thread без
    // отдельного /tickets/:id-запроса.
    listMyTickets: (pagination: { limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams();
      if (pagination.limit !== undefined) query.set("limit", String(pagination.limit));
      if (pagination.offset !== undefined) query.set("offset", String(pagination.offset));
      const suffix = query.toString() ? `?${query.toString()}` : "";
      return apiFetch<
        PaginatedResponse<{
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
        }>
      >(`/support/tickets${suffix}`);
    },
  },

  // ── Админ-CMS ───────────────────────────────────────────────────────────
  // Только GET-методы, которые нужно типизировать. POST/PATCH/DELETE для админ-
  // редактирования пока вызываются напрямую через apiFetch — у них много вариаций
  // (status, reason, payload-схемы), и они туго переплетены с CMS-UI.
  admin: {
    news: {
      // Возвращает paginated envelope БЕЗ blocks (для таблицы).
      // Получение detail для редактора — `admin.news.get(id)`.
      list: (pagination: { limit?: number; offset?: number } = {}) => {
        const query = new URLSearchParams();
        if (pagination.limit !== undefined) query.set("limit", String(pagination.limit));
        if (pagination.offset !== undefined) query.set("offset", String(pagination.offset));
        const suffix = query.toString() ? `?${query.toString()}` : "";
        return apiFetch<
          PaginatedResponse<{
            id: string;
            title: string;
            lead: string;
            slug: string;
            status: string;
            coverImageId: string | null;
            firstPublishedAt: string | null;
            createdAt: string;
            updatedAt: string;
            tags: Array<{ newsTagId: string; newsTag: { id: string; name: string; slug: string } }>;
            _count: { blocks: number; comments: number; likes: number };
          }>
        >(`/admin/content/news${suffix}`);
      },
      get: (id: string) =>
        apiFetch<{
          id: string;
          title: string;
          lead: string;
          slug: string;
          status: string;
          coverImageId: string | null;
          firstPublishedAt: string | null;
          createdAt: string;
          updatedAt: string;
          tags: Array<{ newsTagId: string; newsTag: { id: string; name: string; slug: string } }>;
          blocks: Array<{ id: string; position: number; type: string; payload: Record<string, unknown> }>;
        }>(`/admin/content/news/${enc(id)}`),
    },
  },

  // ── Жалобы (модерация со стороны пользователя) ─────────────────────────
  moderation: {
    createComplaint: (body: {
      entityType: "news_comment" | "news_post" | "knowledge_base_article";
      entityId: string;
      reasonCode: string;
      comment?: string;
    }) => apiFetch<{ id: string }>("/moderation/complaints", { method: "POST", body }),
  },

  // ── Файлы ──────────────────────────────────────────────────────────────
  files: {
    listByIds: (ids: string[]) => apiFetch<FileAsset[]>(`/files?ids=${enc(ids.join(","))}`),
  },

  // ── Юридические документы и согласия ──────────────────────────────────
  legal: {
    list: (types?: LegalDocumentType[]) => {
      const suffix = types && types.length ? `?types=${enc(types.join(","))}` : "";
      return apiFetch<LegalDocumentSummary[]>(`/legal/documents${suffix}`);
    },
    get: (type: LegalDocumentType, version: string) =>
      apiFetch<LegalDocumentDetail>(`/legal/documents/${enc(type)}/${enc(version)}`),
    submitConsents: (documentIds: string[], source: ConsentSource = "settings") =>
      apiFetch<{ ok: true }>("/legal/consents", { method: "POST", body: { documentIds, source } }),
    listMyConsents: () => apiFetch<ConsentRecordItem[]>("/legal/me/consents"),
  },
};

export type ApiClient = typeof api;
