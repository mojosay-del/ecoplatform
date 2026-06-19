"use client";

import { useCallback, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";
type ApiQueryKey = string | QueryKey | null;

function normalizeQueryKey(key: ApiQueryKey): QueryKey {
  return Array.isArray(key) ? key : ["api", key ?? "disabled"];
}

export function useApiQuery<T>(key: ApiQueryKey, fetcher: () => Promise<T>, initial: T) {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const initialRef = useRef(initial);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const queryKey = useMemo(() => normalizeQueryKey(key), [key]);
  const enabled = Boolean(token && key);
  const query = useQuery<T>({
    queryKey,
    queryFn: () => fetcherRef.current(),
    enabled,
  });

  const setData: Dispatch<SetStateAction<T>> = useCallback(
    (next) => {
      if (!key) return;
      queryClient.setQueryData<T>(queryKey, (current) => {
        const previous = current ?? initialRef.current;
        return typeof next === "function" ? (next as (value: T) => T)(previous) : next;
      });
    },
    [key, queryClient, queryKey],
  );

  if (!token) {
    return {
      data: initialRef.current,
      setData,
      state: "unauthenticated" as ApiState,
      errorMessage: null,
      refetch: query.refetch,
    };
  }

  if (!key) {
    return {
      data: initialRef.current,
      setData,
      state: "ready" as ApiState,
      errorMessage: null,
      refetch: query.refetch,
    };
  }

  if (query.error instanceof ApiError && query.error.status === 401) {
    return {
      data: initialRef.current,
      setData,
      state: "unauthenticated" as ApiState,
      errorMessage: null,
      refetch: query.refetch,
    };
  }

  if (query.error instanceof ApiError && query.error.status === 403) {
    return {
      data: initialRef.current,
      setData,
      state: "forbidden" as ApiState,
      errorMessage: null,
      refetch: query.refetch,
    };
  }

  if (query.error) {
    return {
      data: initialRef.current,
      setData,
      state: "error" as ApiState,
      errorMessage: query.error instanceof Error ? query.error.message : "Не удалось загрузить данные",
      refetch: query.refetch,
    };
  }

  return {
    data: query.data ?? initialRef.current,
    setData,
    state: query.isPending ? ("loading" as ApiState) : ("ready" as ApiState),
    errorMessage: null,
    refetch: query.refetch,
  };
}
