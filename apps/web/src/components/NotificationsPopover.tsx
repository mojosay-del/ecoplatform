"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { CheckCheck } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { NOTIFICATION_CATEGORY_LABELS } from "../lib/display-labels";

// Popover, который открывается по колокольчику в шапке. Цель — дать
// быстрый просмотр последних уведомлений и одну кнопку «прочитать все»,
// не уводя пользователя со страницы. Полный архив остаётся на /notifications.

type Notification = {
  id: string;
  category: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

const POPOVER_LIMIT = 10;

type Props = {
  open: boolean;
  onClose: () => void;
  items: Notification[];
  loading: boolean;
  onChanged: () => void;
};

export function NotificationsPopover({ open, onClose, items, loading, onChanged }: Props) {
  const { token } = useAuth();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Закрытие по клику вне popover'а. Используем mousedown, а не click,
  // чтобы перехватить событие до того, как Link успеет сработать.
  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      // Колокольчик сам обернёт нас — клик по нему не должен закрывать
      // popover дважды. Защита через data-атрибут на кнопке-триггере.
      const target = event.target as HTMLElement;
      if (target.closest("[data-notification-bell-trigger]")) return;
      onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, onClose]);

  // Esc — стандартное поведение для всех всплывающих окон.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const markAllRead = useCallback(async () => {
    if (!token) return;
    try {
      await apiFetch("/notifications/read-all", { method: "POST", token });
      onChanged();
      window.dispatchEvent(new Event("notifications:changed"));
    } catch {
      // тихо игнорируем — пользователь увидит, что счётчик не сбросился
    }
  }, [token, onChanged]);

  const markOneRead = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        await apiFetch(`/notifications/${id}/read`, { method: "POST", token });
        onChanged();
        window.dispatchEvent(new Event("notifications:changed"));
      } catch {
        /* ignore */
      }
    },
    [token, onChanged],
  );

  if (!open) return null;

  const recent = items.slice(0, POPOVER_LIMIT);
  const hasUnread = recent.some((item) => !item.readAt);

  return (
    <div ref={rootRef} className="notif-popover" role="dialog" aria-label="Уведомления">
      <header className="notif-popover-head">
        <span className="notif-popover-title">Уведомления</span>
        <button
          type="button"
          className="notif-popover-action"
          onClick={markAllRead}
          disabled={!hasUnread}
          title="Отметить все прочитанными"
        >
          <CheckCheck size={14} /> Прочитать все
        </button>
      </header>

      <div className="notif-popover-body">
        {loading ? <p className="notif-popover-empty">Загружаем…</p> : null}
        {!loading && recent.length === 0 ? <p className="notif-popover-empty">Новых уведомлений нет.</p> : null}
        <ul className="notif-popover-list">
          {recent.map((item) => (
            <li key={item.id} className={`notif-popover-item${item.readAt ? "" : " unread"}`}>
              <button
                type="button"
                className="notif-popover-item-button"
                onClick={() => {
                  if (!item.readAt) void markOneRead(item.id);
                  if (item.link) {
                    onClose();
                    // Переход обрабатывается обёрткой <Link>, поэтому здесь
                    // ничего не делаем — кнопка нужна для непролинкованных.
                  }
                }}
              >
                <div className="notif-popover-item-head">
                  <strong className="notif-popover-item-title">{item.title}</strong>
                  <span className="notif-popover-item-cat">
                    {NOTIFICATION_CATEGORY_LABELS[item.category] ?? item.category}
                  </span>
                </div>
                <p className="notif-popover-item-body">{item.body}</p>
                <span className="notif-popover-item-time">{formatRelative(item.createdAt)}</span>
              </button>
              {item.link ? (
                <Link
                  className="notif-popover-item-link"
                  href={item.link}
                  onClick={() => {
                    if (!item.readAt) void markOneRead(item.id);
                    onClose();
                  }}
                >
                  Открыть
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <footer className="notif-popover-foot">
        <Link className="notif-popover-link" href="/notifications" onClick={onClose}>
          Открыть все уведомления
        </Link>
      </footer>
    </div>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн назад`;
  return new Date(iso).toLocaleDateString("ru-RU");
}
