"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type NotificationItem } from "../api";
import { useAuth } from "../auth";
import { queryKeys } from "../query/keys";

// Единый react-query слой для уведомлений. До этого Bell/Popover/View каждый
// сам дёргал `/notifications` через apiFetch+useEffect (дубль-запросы, ручной
// loading/error, поллинг без паузы в фоне, риск race на unmount). Теперь все
// три делят один кэш под семейством ключей `notifications`, а мутации
// инвалидируют его целиком — счётчик и списки обновляются согласованно.

export type { NotificationItem };

// Глобальное событие «уведомления изменились» дёргают и внешние места
// (кабинет, диалог подписки), которые не используют здешние мутации. Один
// слушатель моста (живёт в колокольчике, он всегда смонтирован) превращает
// его в инвалидацию кэша.
const NOTIFICATIONS_CHANGED_EVENT = "notifications:changed";

const POLL_INTERVAL_MS = 60_000;

export function useUnreadCount() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const enabled = Boolean(token);

  const query = useQuery({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: () => api.notifications.unreadCount(),
    enabled,
    // react-query сам ставит поллинг на паузу в фоновой вкладке
    // (refetchIntervalInBackground по умолчанию false) — нет лишней нагрузки.
    refetchInterval: POLL_INTERVAL_MS,
  });

  // Мост для внешних диспетчеров `notifications:changed`. Внутренние мутации
  // инвалидируют кэш напрямую, событие тут нужно ради кабинета/подписки.
  useEffect(() => {
    if (!enabled) return;
    const onChanged = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
  }, [enabled, queryClient]);

  return enabled ? (query.data?.count ?? 0) : 0;
}

export function usePopoverNotifications(limit: number, enabled: boolean) {
  const { token } = useAuth();
  const query = useQuery({
    queryKey: queryKeys.notifications.popover(limit),
    queryFn: async () => (await api.notifications.list({ limit, offset: 0 })).items,
    enabled: Boolean(token) && enabled,
  });

  return {
    items: query.data ?? [],
    loading: query.isPending && Boolean(token) && enabled,
  };
}

// Мутации над уведомлениями. Все инвалидируют семейство `notifications`, чтобы
// счётчик в колокольчике, popover и полный список оставались согласованными
// без ручной рассылки событий между компонентами.
export function useNotificationMutations() {
  const queryClient = useQueryClient();

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all }),
    [queryClient],
  );

  const markRead = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: invalidate,
  });

  const markAllRead = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: invalidate,
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.notifications.archive(id),
    onSuccess: invalidate,
  });

  return { markRead, markAllRead, archive };
}
