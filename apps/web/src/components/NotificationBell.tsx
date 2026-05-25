"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { NotificationsPopover } from "./NotificationsPopover";

const POLL_INTERVAL_MS = 60_000;

type Notification = {
  id: string;
  category: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

// Колокольчик в шапке. Раньше был ссылкой на /notifications, теперь —
// триггер для popover'а с последними уведомлениями. Полный список остаётся
// доступен из popover'а ссылкой «Открыть все».
export function NotificationBell() {
  const { token } = useAuth();
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const badgeLabel = count > 99 ? "99+" : String(count);

  // Запросить непрочитанный счётчик. Запускается по таймеру и по событию
  // `notifications:changed`, чтобы badge всегда был актуален.
  const loadCount = useCallback(() => {
    if (!token) {
      setCount(0);
      return;
    }
    apiFetch<{ count: number }>("/notifications/unread-count", { token })
      .then((data) => setCount(data.count))
      .catch(() => {
        /* тихо игнорируем — сбои поллинга не должны раздражать пользователя */
      });
  }, [token]);

  const loadList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<Notification[]>("/notifications", { token });
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadCount();
    if (!token) return;
    const id = window.setInterval(loadCount, POLL_INTERVAL_MS);
    window.addEventListener("notifications:changed", loadCount);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("notifications:changed", loadCount);
    };
  }, [token, loadCount]);

  // Подгружаем список лениво — только когда пользователь открывает popover.
  // Это экономит трафик и нагружает API только на действие.
  useEffect(() => {
    if (!open) return;
    void loadList();
  }, [open, loadList]);

  return (
    <div className="notification-bell-root">
      <button
        type="button"
        className="icon-button notification-bell"
        title="Уведомления"
        aria-label="Открыть уведомления"
        aria-expanded={open}
        data-notification-bell-trigger="true"
        onClick={() => setOpen((value) => !value)}
      >
        <BellRing className="notification-bell-icon" size={21} strokeWidth={2.15} />
        {count > 0 ? <span className={`notification-badge ${count > 9 ? "wide" : ""}`}>{badgeLabel}</span> : null}
      </button>
      <NotificationsPopover
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        loading={loading}
        onChanged={() => {
          loadCount();
          void loadList();
        }}
      />
    </div>
  );
}
