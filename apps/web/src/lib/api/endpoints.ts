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
  BillingSubscriptionActivationResponse,
  CompanyProfileUpdateDto,
  ConsentRecordItem,
  ConsentSource,
  AdminDashboardSummary,
  AdminStaffSummary,
  KnowledgeArticleDetail,
  KnowledgeNode,
  LearningModuleDetail,
  LearningModuleListItem,
  LegalDocumentDetail,
  LegalDocumentSummary,
  LegalDocumentType,
  CompanyRatingSummary,
  CreateListingDto,
  CreateOfferDto,
  CreateReviewDto,
  DealResult,
  ListingOfferItem,
  MarketplaceListingDetail,
  MarketplaceListingListItem,
  MarketplaceNomenclatureOption,
  MyMarketplaceListingItem,
  MyOfferItem,
  ReviewItem,
  UpdateListingDto,
  NewsListItem,
  NewsPostDetail,
  NewsTagSummary,
  NomenclatureCategoryListItem,
  PaginatedResponse,
  SelfSubscriptionDto,
} from "@ecoplatform/shared";
import { apiDownload, apiFetch, type FileAsset } from "./core";

type PaginationInput = { limit?: number; offset?: number };
type NewsListInput = PaginationInput & { tags?: string[] };
type AdminNewsListInput = PaginationInput & { q?: string };
type ApiRequestOptions = { token?: string | null };
type PreviewRequestOptions = ApiRequestOptions & { preview?: boolean };

// Лайки и комментарии возвращают одинаковую полезную нагрузку — выносим.
export type LikeResult = {
  liked: boolean;
  likesCount: number;
};

export type AccountDeletionStatus = {
  ok: true;
  deletionRequestedAt: string | null;
  deletionScheduledFor: string | null;
};

function enc(value: string): string {
  // encodeURIComponent для всех динамических сегментов URL: пользовательский
  // slug / id могут содержать спецсимволы. Раньше эта обёртка использовалась
  // непоследовательно.
  return encodeURIComponent(value);
}

function paginationSuffix(pagination: PaginationInput = {}) {
  const query = new URLSearchParams();
  if (pagination.limit !== undefined) query.set("limit", String(pagination.limit));
  if (pagination.offset !== undefined) query.set("offset", String(pagination.offset));
  return query.toString() ? `?${query.toString()}` : "";
}

function newsListSuffix(input: NewsListInput = {}) {
  const query = new URLSearchParams();
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  if (input.offset !== undefined) query.set("offset", String(input.offset));
  input.tags?.forEach((tag) => query.append("tags[]", tag));
  return query.toString() ? `?${query.toString()}` : "";
}

function adminNewsListSuffix(input: AdminNewsListInput = {}) {
  const query = new URLSearchParams();
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  if (input.offset !== undefined) query.set("offset", String(input.offset));
  if (input.q?.trim()) query.set("q", input.q.trim());
  return query.toString() ? `?${query.toString()}` : "";
}

function previewSuffix(options: { preview?: boolean } = {}) {
  return options.preview ? "?preview=1" : "";
}

type MarketplaceFeedInput = PaginationInput & { region?: string[]; nomenclatureId?: string[] };

function marketplaceFeedSuffix(input: MarketplaceFeedInput = {}) {
  const query = new URLSearchParams();
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  if (input.offset !== undefined) query.set("offset", String(input.offset));
  input.region?.forEach((region) => query.append("region[]", region));
  input.nomenclatureId?.forEach((id) => query.append("nomenclatureId[]", id));
  return query.toString() ? `?${query.toString()}` : "";
}

export const api = {
  // ── Новости ─────────────────────────────────────────────────────────────
  news: {
    list: (input: NewsListInput = {}, options: ApiRequestOptions = {}) =>
      apiFetch<PaginatedResponse<NewsListItem>>(`/news${newsListSuffix(input)}`, { token: options.token }),
    tags: (options: { limit?: number } = {}, requestOptions: ApiRequestOptions = {}) =>
      apiFetch<NewsTagSummary[]>(`/news/tags${options.limit !== undefined ? `?limit=${options.limit}` : ""}`, {
        token: requestOptions.token,
      }),
    get: (slug: string, options: PreviewRequestOptions = {}) =>
      apiFetch<NewsPostDetail>(`/news/${enc(slug)}${previewSuffix(options)}`, { token: options.token }),
    like: (id: string) => apiFetch<LikeResult>(`/news/${enc(id)}/like`, { method: "POST" }),
    addComment: (postId: string, body: { text: string; parentCommentId?: string }) =>
      apiFetch<{ id: string }>(`/news/${enc(postId)}/comments`, { method: "POST", body }),
    likeComment: (commentId: string) =>
      apiFetch<LikeResult>(`/news/comments/${enc(commentId)}/like`, { method: "POST" }),
  },

  // ── Индексы цен ─────────────────────────────────────────────────────────
  indices: {
    list: (pagination: PaginationInput = {}) =>
      apiFetch<PaginatedResponse<NomenclatureCategoryListItem>>(`/indices${paginationSuffix(pagination)}`),
  },

  // ── Торговая площадка ─────────────────────────────────────────────────────
  marketplace: {
    listings: (input: MarketplaceFeedInput = {}) =>
      apiFetch<PaginatedResponse<MarketplaceListingListItem>>(`/marketplace/listings${marketplaceFeedSuffix(input)}`),
    regions: () => apiFetch<string[]>("/marketplace/regions"),
    myListings: (pagination: PaginationInput = {}) =>
      apiFetch<PaginatedResponse<MyMarketplaceListingItem>>(`/marketplace/my/listings${paginationSuffix(pagination)}`),
    nomenclature: () => apiFetch<MarketplaceNomenclatureOption[]>("/marketplace/nomenclature"),
    get: (id: string) => apiFetch<MarketplaceListingDetail>(`/marketplace/listings/${enc(id)}`),
    create: (body: CreateListingDto) =>
      apiFetch<MarketplaceListingDetail>("/marketplace/listings", { method: "POST", body }),
    update: (id: string, body: UpdateListingDto) =>
      apiFetch<MarketplaceListingDetail>(`/marketplace/listings/${enc(id)}`, { method: "PATCH", body }),
    publish: (id: string) =>
      apiFetch<MarketplaceListingDetail>(`/marketplace/listings/${enc(id)}/publish`, { method: "POST" }),
    archive: (id: string) =>
      apiFetch<MarketplaceListingDetail>(`/marketplace/listings/${enc(id)}/archive`, { method: "POST" }),
    republish: (id: string) =>
      apiFetch<MarketplaceListingDetail>(`/marketplace/listings/${enc(id)}/republish`, { method: "POST" }),
    offers: {
      mine: (pagination: PaginationInput = {}) =>
        apiFetch<PaginatedResponse<MyOfferItem>>(`/marketplace/my/offers${paginationSuffix(pagination)}`),
      create: (listingId: string, body: CreateOfferDto) =>
        apiFetch<MyOfferItem>(`/marketplace/listings/${enc(listingId)}/offers`, { method: "POST", body }),
      forListing: (listingId: string) =>
        apiFetch<ListingOfferItem[]>(`/marketplace/listings/${enc(listingId)}/offers`),
      update: (offerId: string, body: CreateOfferDto) =>
        apiFetch<MyOfferItem>(`/marketplace/offers/${enc(offerId)}`, { method: "PATCH", body }),
      withdraw: (offerId: string) =>
        apiFetch<MyOfferItem>(`/marketplace/offers/${enc(offerId)}/withdraw`, { method: "POST" }),
      accept: (offerId: string) =>
        apiFetch<ListingOfferItem>(`/marketplace/offers/${enc(offerId)}/accept`, { method: "POST" }),
      deal: (offerId: string, result: DealResult) =>
        apiFetch<ListingOfferItem>(`/marketplace/offers/${enc(offerId)}/deal`, { method: "POST", body: { result } }),
    },
    reviews: {
      forCompany: (companyId: string) =>
        apiFetch<ReviewItem[]>(`/marketplace/companies/${enc(companyId)}/reviews`),
      rating: (companyId: string) =>
        apiFetch<CompanyRatingSummary>(`/marketplace/companies/${enc(companyId)}/rating`),
      create: (offerId: string, body: CreateReviewDto) =>
        apiFetch<ReviewItem>(`/marketplace/offers/${enc(offerId)}/reviews`, { method: "POST", body }),
      remove: (reviewId: string) =>
        apiFetch<{ ok: true }>(`/marketplace/reviews/${enc(reviewId)}`, { method: "DELETE" }),
      respond: (reviewId: string, text: string) =>
        apiFetch<ReviewItem>(`/marketplace/reviews/${enc(reviewId)}/response`, { method: "POST", body: { text } }),
    },
  },

  // ── Обучение ────────────────────────────────────────────────────────────
  learning: {
    listModules: (pagination: PaginationInput = {}) =>
      apiFetch<PaginatedResponse<LearningModuleListItem>>(`/education/modules${paginationSuffix(pagination)}`),
    getModule: (id: string, options: PreviewRequestOptions = {}) =>
      apiFetch<LearningModuleDetail>(`/education/modules/${enc(id)}${previewSuffix(options)}`, {
        token: options.token,
      }),
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
    activateSubscription: (input: SelfSubscriptionDto, options: { idempotencyKey: string }) =>
      apiFetch<BillingSubscriptionActivationResponse>("/billing/subscriptions", {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": options.idempotencyKey },
      }),
  },

  // ── Аутентификация / сессии ────────────────────────────────────────────
  auth: {
    // Публично: открыта ли само-регистрация (тумблер в админке).
    registrationStatus: () => apiFetch<{ enabled: boolean }>("/auth/registration"),
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
    exportData: () => apiDownload("/auth/me/export-data", { method: "POST" }),
    requestDeletion: () => apiFetch<AccountDeletionStatus>("/auth/me/request-deletion", { method: "POST" }),
    cancelDeletion: () => apiFetch<AccountDeletionStatus>("/auth/me/cancel-deletion", { method: "POST" }),
  },

  // ── Уведомления ─────────────────────────────────────────────────────────
  notifications: {
    list: (pagination: PaginationInput = {}) =>
      apiFetch<
        PaginatedResponse<{
          id: string;
          category: string;
          eventType: string;
          title: string;
          body: string;
          link: string | null;
          readAt: string | null;
          archivedAt: string | null;
          createdAt: string;
        }>
      >(`/notifications${paginationSuffix(pagination)}`),
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
    listMyTickets: (pagination: PaginationInput = {}) =>
      apiFetch<
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
      >(`/support/tickets${paginationSuffix(pagination)}`),
  },

  // ── Админ-CMS ───────────────────────────────────────────────────────────
  // Только GET-методы, которые нужно типизировать. POST/PATCH/DELETE для админ-
  // редактирования пока вызываются напрямую через apiFetch — у них много вариаций
  // (status, reason, payload-схемы), и они туго переплетены с CMS-UI.
  admin: {
    dashboard: (options: ApiRequestOptions = {}) =>
      apiFetch<AdminDashboardSummary>("/admin/dashboard", { token: options.token }),
    overview: (options: ApiRequestOptions = {}) =>
      apiFetch<AdminStaffSummary>("/admin/overview", { token: options.token }),
    news: {
      // Возвращает paginated envelope БЕЗ blocks (для таблицы).
      // Получение detail для редактора — `admin.news.get(id)`.
      list: (pagination: AdminNewsListInput = {}) =>
        apiFetch<
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
        >(`/admin/content/news${adminNewsListSuffix(pagination)}`),
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
      entityType: "news_comment" | "news_post" | "knowledge_base_article" | "marketplace_listing" | "marketplace_review";
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
