"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { ApiError } from "./api";

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

export function useInfiniteApiQuery<T>(
  key: string | null,
  pageSize: number,
  fetchPage: (pagination: Pagination) => Promise<InfinitePage<T>>,
) {
  const fetchPageRef = useRef(fetchPage);
  const requestSeq = useRef(0);
  const itemsRef = useRef<T[]>([]);
  const hasMoreRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [items, setItemsState] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState<InfiniteApiState>("idle");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  fetchPageRef.current = fetchPage;
  itemsRef.current = items;
  hasMoreRef.current = hasMore;
  loadingMoreRef.current = isLoadingMore;

  const setItems: Dispatch<SetStateAction<T[]>> = useCallback((next) => {
    setItemsState(next);
  }, []);

  const reload = useCallback(() => {
    setReloadSeq((value) => value + 1);
  }, []);

  useEffect(() => {
    let isActive = true;
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;

    if (!key) {
      setItemsState([]);
      setTotal(0);
      setHasMore(false);
      setState("idle");
      setErrorMessage(null);
      setIsLoadingMore(false);
      return;
    }

    setState("loading");
    setErrorMessage(null);
    setItemsState([]);
    setTotal(0);
    setHasMore(false);

    fetchPageRef
      .current({ limit: pageSize, offset: 0 })
      .then((page) => {
        if (!isActive || requestSeq.current !== seq) return;
        setItemsState(page.items);
        setTotal(page.total);
        setHasMore(page.hasMore);
        setState("ready");
      })
      .catch((error) => {
        if (!isActive || requestSeq.current !== seq) return;
        setItemsState([]);
        setTotal(0);
        setHasMore(false);
        if (error instanceof ApiError && error.status === 401) {
          setState("unauthenticated");
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          setState("forbidden");
          return;
        }
        setState("error");
        setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить данные");
      });

    return () => {
      isActive = false;
    };
  }, [key, pageSize, reloadSeq]);

  const loadMore = useCallback(async () => {
    if (!key || loadingMoreRef.current || !hasMoreRef.current) return;
    const seq = requestSeq.current;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    setErrorMessage(null);
    try {
      const page = await fetchPageRef.current({ limit: pageSize, offset: itemsRef.current.length });
      if (requestSeq.current !== seq) return;
      setItemsState((current) => [...current, ...page.items]);
      setTotal(page.total);
      setHasMore(page.hasMore);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setState("unauthenticated");
      } else if (error instanceof ApiError && error.status === 403) {
        setState("forbidden");
      } else {
        setState("error");
        setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить следующую страницу");
      }
    } finally {
      loadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [key, pageSize]);

  useEffect(() => {
    if (!sentinel || !key || !hasMore || isLoadingMore || state !== "ready") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "480px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, key, loadMore, sentinel, state]);

  return {
    items,
    setItems,
    total,
    hasMore,
    state,
    errorMessage,
    isInitialLoading: state === "loading",
    isLoadingMore,
    loadMore,
    reload,
    sentinelRef: setSentinel,
  };
}
