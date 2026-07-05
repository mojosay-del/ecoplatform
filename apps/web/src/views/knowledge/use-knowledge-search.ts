"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { KnowledgeNode } from "@ecoplatform/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/query";

// Быстрый живой поиск: короткий дебаунс вместо прежних 2 секунд,
// Enter форсирует запрос сразу.
const SEARCH_DEBOUNCE_MS = 300;

export const KNOWLEDGE_SEARCH_EXAMPLES = [
  "Нюансы по ПВД",
  "Стрейч пленка",
  "Критерии по ПЭТ",
  "ГОСТ по картону",
  "Архив",
  "Канистра",
];

export type KnowledgeSearchController = ReturnType<typeof useKnowledgeBaseSearch>;

export function useKnowledgeBaseSearch() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: queryKeys.knowledgeBase.search(debouncedQuery),
    queryFn: () => api.knowledgeBase.search(debouncedQuery),
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
  const searchResults: KnowledgeNode[] | null = searching
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
