"use client";

import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { queryKeys } from "./keys";

export type QueryFamily = "billing" | "files" | "forum" | "knowledgeBase" | "marketplace" | "news";

const FAMILY_ROOTS: Record<QueryFamily, QueryKey> = {
  billing: queryKeys.billing.all,
  files: queryKeys.files.all,
  forum: queryKeys.forum.all,
  knowledgeBase: queryKeys.knowledgeBase.all,
  marketplace: queryKeys.marketplace.all,
  news: queryKeys.news.all,
};

export async function invalidateQueryFamilies(queryClient: QueryClient, families: QueryFamily[]) {
  await Promise.all(families.map((family) => queryClient.invalidateQueries({ queryKey: FAMILY_ROOTS[family] })));
}
