"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { CheckCheck } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AnimatedNavIcon, type AnimatedNavIconHandle } from "./app-shell/nav-icons";

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
const DATE_TIME_WITH_SECONDS_RE = /(\b\d{2}\.\d{2}\.\d{4},\s*\d{1,2}:\d{2}):\d{2}\b/g;

type NotificationMessageIconKey = "sms" | "sms-notification" | "sms-star";

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
            <NotificationPopoverItem key={item.id} item={item} markOneRead={markOneRead} onClose={onClose} />
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

type NotificationPopoverItemProps = {
  item: Notification;
  markOneRead: (id: string) => Promise<void>;
  onClose: () => void;
};

function NotificationPopoverItem({ item, markOneRead, onClose }: NotificationPopoverItemProps) {
  const iconRef = useRef<AnimatedNavIconHandle | null>(null);

  const activate = useCallback(() => {
    if (!item.readAt) void markOneRead(item.id);
    if (item.link) onClose();
  }, [item.id, item.link, item.readAt, markOneRead, onClose]);

  const playIcon = useCallback(() => iconRef.current?.play(), []);
  const resetIcon = useCallback(() => iconRef.current?.reset(), []);
  const iconName = getNotificationIconName(item);
  const className = `notif-popover-item${item.readAt ? "" : " unread"}`;
  const controlClassName = "notif-popover-item-control";
  const content = (
    <>
      <span className="notif-popover-item-icon" aria-hidden="true">
        <AnimatedNavIcon name={iconName} ref={iconRef} size={24} />
      </span>
      <span className="notif-popover-item-copy">
        <span className="notif-popover-item-head">
          <strong className="notif-popover-item-title">{formatPopoverTitle(item)}</strong>
        </span>
        <span className="notif-popover-item-body">{formatPopoverBody(item)}</span>
        <span className="notif-popover-item-time">{formatRelative(item.createdAt)}</span>
      </span>
    </>
  );

  return (
    <li className={className}>
      {item.link ? (
        <Link
          className={controlClassName}
          href={item.link}
          onBlur={resetIcon}
          onClick={activate}
          onFocus={playIcon}
          onMouseEnter={playIcon}
          onMouseLeave={resetIcon}
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          className={controlClassName}
          onBlur={resetIcon}
          onClick={activate}
          onFocus={playIcon}
          onMouseEnter={playIcon}
          onMouseLeave={resetIcon}
        >
          {content}
        </button>
      )}
    </li>
  );
}

function isAuthLoginNotification(item: Notification): boolean {
  return item.category === "security" && /вход/i.test(`${item.title} ${item.body}`);
}

function formatPopoverTitle(item: Notification): string {
  if (isAuthLoginNotification(item)) return "Новый вход в аккаунт";
  return item.title;
}

function formatPopoverBody(item: Notification): string {
  if (isAuthLoginNotification(item)) return "Вход выполнен.";
  return item.body.replace(DATE_TIME_WITH_SECONDS_RE, "$1");
}

function getNotificationIconName(item: Notification): NotificationMessageIconKey {
  if (item.category === "system") return "sms-star";
  return item.readAt ? "sms" : "sms-notification";
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
