"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/query";

// Быстрый живой поиск по реестру: короткий дебаунс вместо прежних 2 секунд,
// Enter форсирует запрос сразу.
const SEARCH_DEBOUNCE_MS = 300;

export const DOCUMENTATION_SEARCH_EXAMPLES = [
  "Договор поставки",
  "Акт приёма",
  "Спецификация",
  "Регламент приёмки",
  "Акт сверки",
  "Памятка",
];

export type DocumentationSearchController = ReturnType<typeof useDocumentationSearch>;

export function useDocumentationSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: queryKeys.documentation.search(debouncedQuery),
    queryFn: () => api.documentation.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  const resetSearch = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  const handleSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setDebouncedQuery(query.trim());
    },
    [query],
  );

  const searching = debouncedQuery.length >= 2;
  const searchResults: DocumentationNode[] | null = searching
    ? searchQuery.error
      ? []
      : (searchQuery.data ?? null)
    : null;

  return {
    debouncedQuery,
    handleSearch,
    hasSearchDraft: query.length > 0,
    query,
    resetSearch,
    searchLoading: searching && searchQuery.isPending,
    searching,
    searchResults,
    setQuery,
  };
}
