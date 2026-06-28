"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { useAuth } from "../auth";
import { queryKeys } from "../query/keys";

// Счётчик «обращения ждут ответа админа» — источник правды для бейджа в
// админ-лаунчпаде и заголовке страницы поддержки. Поллится по образцу
// useUnreadCount; react-query сам ставит паузу в фоновой вкладке. Этот счётчик
// заменил веерные in-app-уведомления админам на каждое сообщение в тикете.

const POLL_INTERVAL_MS = 60_000;

export function useSupportAwaitingCount() {
  const { token, user } = useAuth();
  const enabled = Boolean(token) && (user?.platformRoles ?? []).includes("admin");

  const query = useQuery({
    queryKey: queryKeys.admin.supportAwaitingCount(),
    queryFn: () => api.support.adminAwaitingCount(),
    enabled,
    refetchInterval: POLL_INTERVAL_MS,
  });

  return enabled ? (query.data?.count ?? 0) : 0;
}
