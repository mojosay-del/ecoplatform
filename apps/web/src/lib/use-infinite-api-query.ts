"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryKey } from "@tanstack/react-query";
import { errorText, ApiError } from "./api";
import { useAuth } from "./auth";

export type InfiniteApiState = "idle" | "loading" | "ready" | "unauthenticated" | "forbidden" | "error";

export type InfinitePage<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
};

type Pagination = {
  limit: number;
  offset: number;
};

type InfiniteQueryKey = string | QueryKey | null;

function normalizeQueryKey(key: InfiniteQueryKey): QueryKey {
  return Array.isArray(key) ? key : ["api-infinite", key ?? "disabled"];
}

function flattenPages<T>(data: InfiniteData<InfinitePage<T>, number> | undefined): T[] {
  // Защищаемся от страницы без items (стейл-кэш/гонка при HMR или ошибке fetch).
  return data?.pages.flatMap((page) => page?.items ?? []) ?? [];
}

function loadedItemsCount<T>(pages: InfinitePage<T>[]): number {
  return pages.reduce((sum, page) => sum + (page?.items?.length ?? 0), 0);
}

function patchInfiniteItems<T>(
  current: InfiniteData<InfinitePage<T>, number> | undefined,
  next: SetStateAction<T[]>,
): InfiniteData<InfinitePage<T>, number> | undefined {
  if (!current) return current;

  const previousItems = flattenPages(current);
  const nextItems = typeof next === "function" ? (next as (value: T[]) => T[])(previousItems) : next;
  let cursor = 0;

  return {
    ...current,
    pages: current.pages.map((page) => {
      const pageItems = nextItems.slice(cursor, cursor + page.items.length);
      cursor += page.items.length;
      return { ...page, items: pageItems };
    }),
  };
}

export function useInfiniteApiQuery<T>(
  key: InfiniteQueryKey,
  pageSize: number,
  fetchPage: (pagination: Pagination) => Promise<InfinitePage<T>>,
) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const fetchPageRef = useRef(fetchPage);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  fetchPageRef.current = fetchPage;
  const queryKey = useMemo(() => normalizeQueryKey(key), [key]);
  const enabled = Boolean(token && key);

  const setItems: Dispatch<SetStateAction<T[]>> = useCallback(
    (next) => {
      if (!key) return;
      queryClient.setQueryData<InfiniteData<InfinitePage<T>, number>>(queryKey, (current) =>
        patchInfiniteItems(current, next),
      );
    },
    [key, queryClient, queryKey],
  );

  const reload = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const query = useInfiniteQuery<InfinitePage<T>, unknown, InfiniteData<InfinitePage<T>, number>, QueryKey, number>({
    queryKey,
    queryFn: ({ pageParam }) => fetchPageRef.current({ limit: pageSize, offset: pageParam }),
    enabled,
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => (lastPage?.hasMore ? loadedItemsCount(pages) : undefined),
  });

  const items = flattenPages(query.data);
  const lastPage = query.data?.pages.at(-1);
  const firstPage = query.data?.pages[0];
  const total = firstPage?.total ?? 0;
  const hasMore = Boolean(lastPage?.hasMore);
  const isLoadingMore = query.isFetchingNextPage;

  let state: InfiniteApiState = "idle";
  let errorMessage: string | null = null;

  if (!key) {
    state = "idle";
  } else if (!token) {
    state = "unauthenticated";
  } else if (query.error instanceof ApiError && query.error.status === 401) {
    state = "unauthenticated";
  } else if (query.error instanceof ApiError && query.error.status === 403) {
    state = "forbidden";
  } else if (query.error) {
    state = "error";
    errorMessage = errorText(query.error, "Не удалось загрузить данные");
  } else if (query.isPending) {
    state = "loading";
  } else {
    state = "ready";
  }

  useEffect(() => {
    if (!sentinel || !enabled || !hasMore || isLoadingMore || state !== "ready") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void query.fetchNextPage();
        }
      },
      { rootMargin: "480px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, hasMore, isLoadingMore, query, sentinel, state]);

  return {
    items,
    setItems,
    total,
    hasMore,
    state,
    errorMessage,
    isInitialLoading: state === "loading",
    isLoadingMore,
    loadMore: query.fetchNextPage,
    reload,
    sentinelRef: setSentinel,
  };
}
