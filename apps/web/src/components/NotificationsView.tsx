"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import "./notifications.css";
import { BellOff, CheckCheck, CreditCard, HelpCircle, type LucideIcon, MessageSquare, Settings } from "lucide-react";
import { AppShell } from "./AppShell";
import { StatusPill } from "./StatusPill";
import { api, apiFetch } from "../lib/api";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";
import { useAuth } from "../lib/auth";
import { NOTIFICATION_CATEGORY_LABELS } from "../lib/display-labels";

type Notification = {
  id: string;
  category: string;
  eventType: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

const categoryIcons: Record<string, LucideIcon> = {
  billing: CreditCard,
  moderation: MessageSquare,
  support: HelpCircle,
  system: Settings,
};

const NOTIFICATIONS_PAGE_SIZE = 30;

type ViewState = "unauthenticated" | "loading" | "ready" | "error";

export function NotificationsView() {
  const { token } = useAuth();
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const notifications = useInfiniteApiQuery<Notification>(
    token ? "notifications" : null,
    NOTIFICATIONS_PAGE_SIZE,
    ({ limit, offset }) => api.notifications.list({ limit, offset }),
  );
  const items = notifications.items;
  const setItems = notifications.setItems;

  const load = useCallback(() => {
    if (!token) {
      setState("unauthenticated");
      setErrorMessage(null);
      return;
    }
    setState("ready");
    setErrorMessage(null);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!token || state !== "ready" || !items.some((item) => !item.readAt)) return;

    const now = new Date().toISOString();
    apiFetch("/notifications/read-all", { method: "POST", token })
      .then(() => {
        setItems((prev) => prev.map((item) => (item.readAt ? item : { ...item, readAt: now })));
        window.dispatchEvent(new Event("notifications:changed"));
      })
      .catch(() => undefined);
  }, [items, state, token]);

  async function markRead(id: string) {
    if (!token) return;
    try {
      await apiFetch(`/notifications/${id}/read`, { method: "POST", token });
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)));
      window.dispatchEvent(new Event("notifications:changed"));
    } catch {
      /* пользователь увидит при следующей загрузке */
    }
  }

  async function archive(id: string) {
    if (!token) return;
    try {
      await apiFetch(`/notifications/${id}/archive`, { method: "POST", token });
      setItems((prev) => prev.filter((item) => item.id !== id));
      window.dispatchEvent(new Event("notifications:changed"));
    } catch {
      /* тихо */
    }
  }

  async function markAllRead() {
    if (!token) return;
    try {
      await apiFetch("/notifications/read-all", { method: "POST", token });
      const now = new Date().toISOString();
      setItems((prev) => prev.map((item) => (item.readAt ? item : { ...item, readAt: now })));
      window.dispatchEvent(new Event("notifications:changed"));
    } catch {
      /* тихо */
    }
  }

  if (state === "unauthenticated" || notifications.state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <header className="page-header">
            <h1 className="page-title">Уведомления</h1>
            <p className="page-subtitle">Войдите, чтобы видеть свои уведомления.</p>
          </header>
          <div className="auth-actions">
            <Link className="button" href="/login">
              Войти
            </Link>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Уведомления</h1>
          <p className="page-subtitle">Все системные сообщения по вашему аккаунту.</p>
        </header>
        {(errorMessage || notifications.errorMessage) && state !== "loading" && !notifications.isInitialLoading ? (
          <StatusPill as="p" variant="danger">
            {errorMessage ?? notifications.errorMessage}
          </StatusPill>
        ) : null}
        {state === "loading" || notifications.isInitialLoading ? <p className="page-subtitle">Загрузка…</p> : null}
        {state === "ready" && notifications.state !== "error" ? (
          <>
            <div className="notifications-toolbar">
              <button className="button secondary" onClick={markAllRead} disabled={items.every((item) => item.readAt)}>
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
                            <Link className="button" href={item.link} onClick={() => markRead(item.id)}>
                              Перейти
                            </Link>
                          ) : null}
                          {!item.readAt ? (
                            <button className="button ghost" onClick={() => markRead(item.id)}>
                              Прочитано
                            </button>
                          ) : null}
                          <button className="button ghost" onClick={() => archive(item.id)}>
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
