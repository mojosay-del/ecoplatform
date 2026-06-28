"use client";

import type { ForumListInput } from "../api/forum-endpoints";

type NewsListInput = {
  limit?: number;
  offset?: number;
  q?: string;
  tags?: string[];
};

type MarketplaceFeedInput = {
  limit?: number;
  offset?: number;
  region?: string[];
  nomenclatureId?: string[];
  bbox?: string | null;
};

function sorted(values: string[] | undefined): string[] {
  return Array.from(new Set(values ?? [])).sort();
}

function cleanRecord<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "")) as T;
}

export const queryKeys = {
  files: {
    all: ["files"] as const,
    byIds: (ids: string[]) => ["files", "by-ids", sorted(ids)] as const,
  },
  billing: {
    all: ["billing"] as const,
    status: () => ["billing", "status"] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    unreadCount: () => ["notifications", "unread-count"] as const,
    // Лента в popover'е (короткая) и полный список (infinite) держим под
    // разными ключами, но в одном семействе — инвалидация бьёт по обоим.
    popover: (limit: number) => ["notifications", "popover", limit] as const,
    list: () => ["notifications", "list"] as const,
  },
  admin: {
    all: ["admin"] as const,
    education: () => ["admin", "education"] as const,
    indices: () => ["admin", "indices"] as const,
    settings: () => ["admin", "settings"] as const,
    moderationCases: (status = "") => ["admin", "moderation", "cases", status] as const,
    // Списки с поиском кэшируются per-query — смена строки сама триггерит
    // запрос (без ручного debounce-refetch в компоненте).
    billingCompanies: (q: string) => ["admin", "billing", "companies", q.trim()] as const,
    billingSummary: () => ["admin", "billing", "summary"] as const,
    newsList: (q: string) => ["admin", "news", "list", q.trim()] as const,
    newsTags: () => ["admin", "news", "tags"] as const,
    knowledge: () => ["admin", "knowledge"] as const,
    documentation: () => ["admin", "documentation"] as const,
    forumTaxonomy: () => ["admin", "forum", "taxonomy"] as const,
    forumQuestions: (status: string, q = "") => ["admin", "forum", "questions", status, q.trim()] as const,
    forumQuestion: (id: string) => ["admin", "forum", "question", id] as const,
    supportAwaitingCount: () => ["admin", "support", "awaiting-count"] as const,
  },
  news: {
    all: ["news"] as const,
    lists: () => ["news", "list"] as const,
    list: (input: NewsListInput = {}) =>
      [
        "news",
        "list",
        cleanRecord({
          limit: input.limit,
          offset: input.offset,
          q: input.q?.trim(),
          tags: sorted(input.tags),
        }),
      ] as const,
    detail: (slug: string, preview = false) => ["news", "detail", slug, preview] as const,
  },
  forum: {
    all: ["forum"] as const,
    lists: () => ["forum", "list"] as const,
    list: (input: ForumListInput = {}) =>
      [
        "forum",
        "list",
        cleanRecord({
          limit: input.limit,
          offset: input.offset,
          q: input.q?.trim(),
          rawMaterialId: input.rawMaterialId ?? undefined,
          questionTypeId: input.questionTypeId ?? undefined,
          sort: input.sort,
        }),
      ] as const,
    detail: (id: string) => ["forum", "detail", id] as const,
    taxonomy: () => ["forum", "taxonomy"] as const,
    pinnedNews: () => ["forum", "pinned-news"] as const,
    summary: () => ["forum", "summary"] as const,
  },
  knowledgeBase: {
    all: ["knowledge-base"] as const,
    tree: () => ["knowledge-base", "tree"] as const,
    article: (slug: string) => ["knowledge-base", "article", slug] as const,
    search: (q: string) => ["knowledge-base", "search", q.trim()] as const,
  },
  marketplace: {
    all: ["marketplace"] as const,
    listings: (input: MarketplaceFeedInput = {}) =>
      [
        "marketplace",
        "listings",
        cleanRecord({
          limit: input.limit,
          offset: input.offset,
          region: sorted(input.region),
          nomenclatureId: sorted(input.nomenclatureId),
          bbox: input.bbox ?? undefined,
        }),
      ] as const,
    regions: () => ["marketplace", "regions"] as const,
    nomenclature: () => ["marketplace", "nomenclature"] as const,
    detail: (id: string) => ["marketplace", "detail", id] as const,
    myListings: () => ["marketplace", "my-listings"] as const,
    myOffers: () => ["marketplace", "my-offers"] as const,
    listingOffers: (listingId: string) => ["marketplace", "listing-offers", listingId] as const,
    companyReviews: (companyId: string) => ["marketplace", "company-reviews", companyId] as const,
    companyRating: (companyId: string) => ["marketplace", "company-rating", companyId] as const,
  },
} as const;
