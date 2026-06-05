"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

// Хук загрузки данных через типизированный fetcher (`api.news.get`,
// `api.learning.getModule`, …) с четырьмя состояниями loading/ready/forbidden/
// error (unauthenticated отдельно — пока токен не прогружен). Параметр `key` —
// стабильная строка, в которой кодируются все переменные fetcher'а (id/slug):
// меняется key → перезапрашиваем; идентичность функции fetcher НЕ важна.
export function useApiQuery<T>(key: string | null, fetcher: () => Promise<T>, initial: T) {
  const { token } = useAuth();
  const initialRef = useRef(initial);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const [data, setData] = useState<T>(initial);
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;
    if (!token) {
      setData(initialRef.current);
      setState("unauthenticated");
      setErrorMessage(null);
      return;
    }
    if (!key) {
      setData(initialRef.current);
      setState("ready");
      setErrorMessage(null);
      return;
    }
    setState("loading");
    setErrorMessage(null);
    fetcherRef
      .current()
      .then((result) => {
        if (!isActive) return;
        setData(result);
        setState("ready");
      })
      .catch((error) => {
        if (!isActive) return;
        if (error instanceof ApiError && error.status === 401) {
          setState("unauthenticated");
          return;
        }
        if (error instanceof ApiError && error.status === 403) {
          setState("forbidden");
          return;
        }
        setData(initialRef.current);
        setState("error");
        setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить данные");
      });
    return () => {
      isActive = false;
    };
  }, [key, token]);

  return { data, setData, state, errorMessage };
}
