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
