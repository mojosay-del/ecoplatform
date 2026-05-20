"use client";

import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

type SettingItem = {
  key: string;
  label: string;
  description: string;
  defaultValue: number;
  value: number;
  updatedAt: string | null;
  updatedById: string | null;
};

export function AdminSettingsView() {
  const { token } = useAuth();
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [items, setItems] = useState<SettingItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  async function loadList() {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setErrorMessage(null);
    try {
      const data = await apiFetch<SettingItem[]>("/admin/settings", { token });
      setItems(data);
      setDrafts(Object.fromEntries(data.map((item) => [item.key, String(item.value)])));
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить настройки");
    }
  }

  async function save(key: string) {
    if (!token) return;
    const raw = drafts[key];
    const num = Number(raw);
    if (Number.isNaN(num)) {
      setErrorMessage("Значение должно быть числом.");
      return;
    }
    setSavingKey(key);
    setErrorMessage(null);
    try {
      await apiFetch(`/admin/settings/${key}`, { method: "PATCH", token, body: { value: num } });
      await loadList();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось сохранить настройку");
    } finally {
      setSavingKey(null);
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Настройки платформы</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Настройки платформы</h1>
          <p className="page-subtitle">Раздел доступен только администратору.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Настройки платформы</h1>
          <p className="page-subtitle">
            Параметры, которые раньше были жёстко прописаны в коде. Сохранение действует моментально.
          </p>
        </header>

        {errorMessage ? <p className="status-pill">{errorMessage}</p> : null}
        {state === "loading" ? <p className="page-subtitle">Загрузка…</p> : null}

        <div className="stack-list">
          {items.map((item) => (
            <article className="checklist-block" key={item.key}>
              <strong>{item.label}</strong>
              <p className="page-subtitle">{item.description}</p>
              <p>
                <small>Ключ: {item.key} · По умолчанию: {item.defaultValue}</small>
              </p>
              <div className="auth-actions">
                <input
                  className="input"
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [item.key]: event.target.value }))
                  }
                  type="number"
                  value={drafts[item.key] ?? ""}
                />
                <button
                  className="button"
                  disabled={savingKey === item.key || drafts[item.key] === String(item.value)}
                  onClick={() => save(item.key)}
                  type="button"
                >
                  {savingKey === item.key ? "Сохраняю…" : "Сохранить"}
                </button>
              </div>
              {item.updatedAt ? (
                <small>Последнее изменение: {new Date(item.updatedAt).toLocaleString("ru-RU")}</small>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
