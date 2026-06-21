"use client";

import { useCallback, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { apiFetch } from "../../../lib/api";
import { queryKeys } from "../../../lib/query/keys";
import { useApiQuery } from "../../shared";
import { DOC_LIST_PATH } from "./constants";
import type { DocArticle } from "./types";
import { isDocCategory, sortByPosition } from "./utils";

export type SetDocumentationItems = Dispatch<SetStateAction<DocArticle[]>>;

export function useAdminDocumentationList() {
  const {
    data: items,
    setData: setItems,
    state,
    errorMessage,
    refetch,
  } = useApiQuery<DocArticle[]>(
    queryKeys.admin.documentation(),
    async () => (await apiFetch<PaginatedResponse<DocArticle>>(`${DOC_LIST_PATH}?limit=200`)).items,
    [],
  );

  const reload = useCallback(async (): Promise<DocArticle[]> => {
    const result = await refetch();
    return result.data ?? [];
  }, [refetch]);

  const categories = useMemo(() => items.filter(isDocCategory).sort(sortByPosition), [items]);
  const categoryIds = useMemo(() => new Set(categories.map((category) => category.id)), [categories]);
  const documentsByCategory = useMemo(() => {
    const grouped = new Map<string, DocArticle[]>();
    for (const category of categories) {
      grouped.set(category.id, []);
    }
    for (const item of items) {
      if (isDocCategory(item)) continue;
      if (item.parentId && grouped.has(item.parentId)) {
        grouped.get(item.parentId)!.push(item);
      }
    }
    for (const documents of grouped.values()) {
      documents.sort(sortByPosition);
    }
    return grouped;
  }, [categories, items]);
  const uncategorizedDocuments = useMemo(
    () =>
      items
        .filter((item) => !isDocCategory(item) && (!item.parentId || !categoryIds.has(item.parentId)))
        .sort(sortByPosition),
    [categoryIds, items],
  );

  return {
    categories,
    documentsByCategory,
    errorMessage,
    items,
    reload,
    setItems,
    state,
    uncategorizedDocuments,
  };
}
