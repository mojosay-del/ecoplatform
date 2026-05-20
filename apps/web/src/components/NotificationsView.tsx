"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type Notification = {
  id: string;
  category: string;
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

const preferenceCategories = ["marketplace", "moderation", "support", "system"];
const lockedCategories = ["security", "billing"];
const defaultPreferences: NotificationPreferences = { inAppMutedCategories: [], emailMutedCategories: [] };

type ViewState = "unauthenticated" | "loading" | "ready" | "error";

export function NotificationsView() {
  const { token } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) {
      setState("unauthenticated");
      setItems([]);
      setPreferences(defaultPreferences);
      return;
    }
    setState("loading");
    Promise.all([
      apiFetch<Notification[]>("/notifications", { token }),
      apiFetch<NotificationPreferences>("/notifications/preferences", { token }),
    ])
      .then(([notifications, nextPreferences]) => {
        setItems(notifications);
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

  async function toggleInAppCategory(category: string) {
    if (!token) return;

    const muted = new Set(preferences.inAppMutedCategories);
    if (muted.has(category)) {
      muted.delete(category);
    } else {
      muted.add(category);
    }

    const nextPreferences = {
      ...preferences,
      inAppMutedCategories: [...muted],
    };

    setPreferences(nextPreferences);
    setSavingCategory(category);
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

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <header className="page-header">
            <h1 className="page-title">Уведомления</h1>
            <p className="page-subtitle">Войдите, чтобы видеть свои уведомления.</p>
          </header>
          <div className="auth-actions">
            <Link className="button" href="/login">Войти</Link>
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
        {errorMessage && state !== "loading" ? <p className="status-pill">{errorMessage}</p> : null}
        {state === "loading" ? <p className="page-subtitle">Загрузка…</p> : null}
        {state === "ready" ? (
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
                {items.map((item) => (
                  <article className={`notification-card ${item.readAt ? "" : "unread"}`} key={item.id}>
                    <div className="notification-head">
                      <span className="status-pill">{categoryLabels[item.category] ?? item.category}</span>
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
                ))}
              </div>
            )}
            <section className="notification-preferences">
              <h2>Настройки</h2>
              <div className="preference-list">
                {preferenceCategories.map((category) => {
                  const checked = !preferences.inAppMutedCategories.includes(category);
                  return (
                    <label className="preference-row" key={category}>
                      <span>{categoryLabels[category]}</span>
                      <input
                        checked={checked}
                        disabled={savingCategory === category}
                        onChange={() => toggleInAppCategory(category)}
                        type="checkbox"
                      />
                    </label>
                  );
                })}
                {lockedCategories.map((category) => (
                  <div className="preference-row locked" key={category}>
                    <span>{categoryLabels[category]}</span>
                    <span className="status-pill">Всегда включено</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
