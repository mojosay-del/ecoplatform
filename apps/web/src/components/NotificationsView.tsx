"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import "./notifications.css";
import { BellOff, CheckCheck, CreditCard, HelpCircle, type LucideIcon, MessageSquare, Settings } from "lucide-react";
import { AppShell } from "./AppShell";
import { StatusPill } from "./StatusPill";
import { api } from "../lib/api";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";
import { useNotificationMutations, type NotificationItem } from "../lib/notifications/use-notifications";
import { queryKeys } from "../lib/query/keys";
import { useAuth } from "../lib/auth";
import { NOTIFICATION_CATEGORY_LABELS } from "../lib/display-labels";

const categoryIcons: Record<string, LucideIcon> = {
  billing: CreditCard,
  moderation: MessageSquare,
  support: HelpCircle,
  system: Settings,
};

const NOTIFICATIONS_PAGE_SIZE = 30;

export function NotificationsView() {
  const { token } = useAuth();
  const { markRead, markAllRead, archive } = useNotificationMutations();
  const notifications = useInfiniteApiQuery<NotificationItem>(
    token ? queryKeys.notifications.list() : null,
    NOTIFICATIONS_PAGE_SIZE,
    ({ limit, offset }) => api.notifications.list({ limit, offset }),
  );
  const items = notifications.items;

  // Открытие страницы помечает всё прочитанным — один раз за монтирование.
  // Мутация инвалидирует кэш уведомлений → список и счётчик в колокольчике
  // обновятся согласованно.
  const autoMarkedRef = useRef(false);
  useEffect(() => {
    if (autoMarkedRef.current) return;
    if (notifications.state !== "ready") return;
    if (!items.some((item) => !item.readAt)) return;
    autoMarkedRef.current = true;
    markAllRead.mutate();
  }, [items, markAllRead, notifications.state]);

  if (notifications.state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <header className="page-header">
            <h1 className="page-title">Уведомления</h1>
            <p className="page-subtitle">Войдите, чтобы видеть свои уведомления.</p>
          </header>
          <div className="form-actions">
            <Link className="button" href="/login">
              Войти
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  const isReady = notifications.state === "ready";

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Уведомления</h1>
          <p className="page-subtitle">Все системные сообщения по вашему аккаунту.</p>
        </header>
        {notifications.errorMessage && !notifications.isInitialLoading ? (
          <StatusPill as="p" variant="danger">
            {notifications.errorMessage}
          </StatusPill>
        ) : null}
        {notifications.isInitialLoading ? <p className="page-subtitle">Загрузка…</p> : null}
        {isReady ? (
          <>
            <div className="notifications-toolbar">
              <button
                className="button secondary"
                onClick={() => markAllRead.mutate()}
                disabled={items.every((item) => item.readAt) || markAllRead.isPending}
              >
                <CheckCheck aria-hidden size={16} />
                Отметить все прочитанными
              </button>
            </div>
            {items.length === 0 ? (
              <div className="notification-empty">
                <span className="notification-empty-icon" aria-hidden>
                  <BellOff size={26} />
                </span>
                <p className="notification-empty-title">Уведомлений нет</p>
                <p className="page-subtitle">Здесь появятся системные сообщения по вашему аккаунту.</p>
              </div>
            ) : (
              <div className="notification-list">
                {items.map((item) => {
                  const Icon = categoryIcons[item.category] ?? Settings;
                  return (
                    <article
                      className={`notification-card ${item.readAt ? "is-read" : "is-unread"}`}
                      data-category={item.category}
                      key={item.id}
                    >
                      <div className="notification-icon" aria-hidden>
                        <Icon size={18} />
                      </div>
                      <div className="notification-body">
                        <div className="notification-head">
                          <span className="notification-cat">
                            {NOTIFICATION_CATEGORY_LABELS[item.category] ?? item.category}
                          </span>
                          <time className="notification-time">{new Date(item.createdAt).toLocaleString("ru-RU")}</time>
                        </div>
                        <h2 className="notification-title">{item.title}</h2>
                        <p className="notification-text">{item.body}</p>
                        <div className="notification-actions">
                          {item.link ? (
                            <Link className="button" href={item.link} onClick={() => markRead.mutate(item.id)}>
                              Перейти
                            </Link>
                          ) : null}
                          {!item.readAt ? (
                            <button className="button ghost" onClick={() => markRead.mutate(item.id)}>
                              Прочитано
                            </button>
                          ) : null}
                          <button className="button ghost" onClick={() => archive.mutate(item.id)}>
                            В архив
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <div ref={notifications.sentinelRef} aria-hidden="true" />
            {notifications.isLoadingMore ? <p className="page-subtitle">Загружаем ещё…</p> : null}
            {!notifications.hasMore && items.length > 0 ? <p className="page-subtitle">Это все записи.</p> : null}
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
