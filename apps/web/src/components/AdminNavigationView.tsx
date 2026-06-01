"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdminNavResponse } from "@ecoplatform/shared";
import { AppShell } from "./AppShell";
import { StatusPill } from "./StatusPill";
import { ApiError, api } from "../lib/api";
import { useAuth } from "../lib/auth";

type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

export function AdminNavigationView() {
  const { token } = useAuth();
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [data, setData] = useState<AdminNavResponse | null>(null);
  // Draft: набор скрытых ключей. Сохраняется только по кнопке.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [savedHidden, setSavedHidden] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setErrorMessage(null);
    try {
      const response = await api.navigation.adminGet();
      setData(response);
      const hiddenKeys = new Set(
        response.sections.flatMap((section) => section.items.filter((i) => i.hidden).map((i) => i.key)),
      );
      setHidden(new Set(hiddenKeys));
      setSavedHidden(new Set(hiddenKeys));
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить меню");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const isDirty = useMemo(() => {
    if (hidden.size !== savedHidden.size) return true;
    for (const key of hidden) {
      if (!savedHidden.has(key)) return true;
    }
    return false;
  }, [hidden, savedHidden]);

  function toggle(key: string, visible: boolean) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const response = await api.navigation.adminSave([...hidden]);
      setData(response);
      const hiddenKeys = new Set(
        response.sections.flatMap((section) => section.items.filter((i) => i.hidden).map((i) => i.key)),
      );
      setHidden(new Set(hiddenKeys));
      setSavedHidden(new Set(hiddenKeys));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось сохранить меню");
    } finally {
      setSaving(false);
    }
  }

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Меню сайта</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Меню сайта</h1>
          <p className="page-subtitle">Раздел доступен только администратору.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Меню сайта</h1>
          <p className="page-subtitle">
            Скрытые пункты пропадают из левого меню у всех пользователей, а их страницы становятся недоступны даже по
            прямой ссылке. Порядок и категории пунктов задаются в коде.
          </p>
        </header>

        {errorMessage ? (
          <StatusPill as="p" variant="danger">
            {errorMessage}
          </StatusPill>
        ) : null}
        {state === "loading" ? <p className="page-subtitle">Загрузка…</p> : null}

        <div className="admin-nav-actions">
          <button className="button" disabled={!isDirty || saving} onClick={() => void save()} type="button">
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
          {isDirty ? <span className="page-subtitle">Есть несохранённые изменения</span> : null}
        </div>

        {data?.sections.map((section) => (
          <div className="settings-pane" key={section.key}>
            <header className="settings-pane-head">
              <h2 className="settings-pane-title">{section.title}</h2>
            </header>
            <div className="settings-list">
              {section.items.length === 0 ? <p className="page-subtitle">В этой категории нет пунктов.</p> : null}
              {section.items.map((item) => {
                const visible = !hidden.has(item.key);
                return (
                  <article className="setting-row" key={item.key}>
                    <div className="setting-row-info">
                      <strong className="setting-row-label">{item.label}</strong>
                      <p className="setting-row-description">
                        {item.placeholder ? "Раздел в разработке (заглушка)" : (item.href ?? "")}
                      </p>
                    </div>
                    <div className="setting-row-control">
                      <label className="setting-toggle">
                        <input
                          checked={visible}
                          onChange={(event) => toggle(item.key, event.target.checked)}
                          type="checkbox"
                        />
                        <span>{visible ? "Показан" : "Скрыт"}</span>
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </AppShell>
  );
}
