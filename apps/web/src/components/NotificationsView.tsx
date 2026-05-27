"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CreditCard, HelpCircle, type LucideIcon, MessageSquare, Settings, Shield, ShoppingBag } from "lucide-react";
import { AppShell } from "./AppShell";
import { StatusPill } from "./StatusPill";
import { api, apiFetch } from "../lib/api";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";
import { useAuth } from "../lib/auth";

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

type NotificationPreferences = {
  inAppMutedCategories: string[];
  emailMutedCategories: string[];
};

const categoryLabels: Record<string, string> = {
  security: "Безопасность",
  billing: "Биллинг",
  marketplace: "Площадка",
  moderation: "Модерация",
  support: "Поддержка",
  system: "Система",
};

const categoryIcons: Record<string, LucideIcon> = {
  security: Shield,
  billing: CreditCard,
  marketplace: ShoppingBag,
  moderation: MessageSquare,
  support: HelpCircle,
  system: Settings,
};

const preferenceCategories = ["marketplace", "moderation", "support", "system"];
const lockedCategories = ["security", "billing"];
const defaultPreferences: NotificationPreferences = { inAppMutedCategories: [], emailMutedCategories: [] };
const NOTIFICATIONS_PAGE_SIZE = 30;

type ViewState = "unauthenticated" | "loading" | "ready" | "error";

export function NotificationsView() {
  const { token } = useAuth();
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
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
      setPreferences(defaultPreferences);
      return;
    }
    setState("loading");
    apiFetch<NotificationPreferences>("/notifications/preferences", { token })
      .then((nextPreferences) => {
        setPreferences(nextPreferences);
        setState("ready");
        setErrorMessage(null);
      })
      .catch((error) => {
        setState("error");
        setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить уведомления");
      });
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

  async function toggleCategoryChannel(category: string, channel: "in_app" | "email") {
    if (!token) return;

    const field = channel === "in_app" ? "inAppMutedCategories" : "emailMutedCategories";
    const muted = new Set(preferences[field]);
    if (muted.has(category)) {
      muted.delete(category);
    } else {
      muted.add(category);
    }

    const nextPreferences = {
      ...preferences,
      [field]: [...muted],
    };

    setPreferences(nextPreferences);
    setSavingCategory(`${category}:${channel}`);
    try {
      const saved = await apiFetch<NotificationPreferences>("/notifications/preferences", {
        method: "PATCH",
        token,
        body: nextPreferences,
      });
      setPreferences(saved);
    } catch (error) {
      setPreferences(preferences);
      setErrorMessage(error instanceof Error ? error.message : "Не удалось сохранить настройки");
    } finally {
      setSavingCategory(null);
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
                Отметить все прочитанными
              </button>
            </div>
            {items.length === 0 ? (
              <p className="page-subtitle">Новых уведомлений нет.</p>
            ) : (
              <div className="notification-list">
                {items.map((item) => {
                  const Icon = categoryIcons[item.category] ?? Settings;
                  return (
                    <article className={`notification-card ${item.readAt ? "" : "unread"}`} key={item.id}>
                      <div className="notification-head">
                        <StatusPill>
                          <Icon size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                          {categoryLabels[item.category] ?? item.category}
                        </StatusPill>
                        <time>{new Date(item.createdAt).toLocaleString("ru-RU")}</time>
                      </div>
                      <h2>{item.title}</h2>
                      <p>{item.body}</p>
                      <div className="notification-actions">
                        {item.link ? (
                          <Link className="button" href={item.link} onClick={() => markRead(item.id)}>
                            Перейти
                          </Link>
                        ) : null}
                        {!item.readAt ? (
                          <button className="button secondary" onClick={() => markRead(item.id)}>
                            Прочитано
                          </button>
                        ) : null}
                        <button className="button secondary" onClick={() => archive(item.id)}>
                          В архив
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            <div ref={notifications.sentinelRef} aria-hidden="true" />
            {notifications.isLoadingMore ? <p className="page-subtitle">Загружаем ещё…</p> : null}
            {!notifications.hasMore && items.length > 0 ? <p className="page-subtitle">Это все записи.</p> : null}
            <section className="notification-preferences">
              <h2>Настройки</h2>
              <p className="page-subtitle">
                Управляйте каналами доставки. Email-канал пока в режиме задела: уведомления ставятся в очередь и
                отправятся, когда подключим почту.
              </p>
              <div className="preference-list">
                {preferenceCategories.map((category) => {
                  const Icon = categoryIcons[category] ?? Settings;
                  const inAppOn = !preferences.inAppMutedCategories.includes(category);
                  const emailOn = !preferences.emailMutedCategories.includes(category);
                  return (
                    <div className="preference-row" key={category}>
                      <span>
                        <Icon size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                        {categoryLabels[category]}
                      </span>
                      <label style={{ marginRight: 12 }}>
                        <input
                          checked={inAppOn}
                          disabled={savingCategory === `${category}:in_app`}
                          onChange={() => toggleCategoryChannel(category, "in_app")}
                          type="checkbox"
                        />{" "}
                        В приложении
                      </label>
                      <label>
                        <input
                          checked={emailOn}
                          disabled={savingCategory === `${category}:email`}
                          onChange={() => toggleCategoryChannel(category, "email")}
                          type="checkbox"
                        />{" "}
                        Email
                      </label>
                    </div>
                  );
                })}
                {lockedCategories.map((category) => {
                  const Icon = categoryIcons[category] ?? Settings;
                  return (
                    <div className="preference-row locked" key={category}>
                      <span>
                        <Icon size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
                        {categoryLabels[category]}
                      </span>
                      <StatusPill variant="success">Всегда включено</StatusPill>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
