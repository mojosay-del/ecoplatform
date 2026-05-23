"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { AdminJournalsView } from "./AdminJournalsView";
import { AdminUsersView } from "./AdminUsersView";
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

// Группировка настроек по префиксу ключа (часть до точки). Раньше всё
// валилось в одну простыню — пользователь не понимал, что где. Теперь
// каждая группа имеет читаемое название, описание и единицу измерения
// для всех своих полей.
type GroupDef = {
  id: string;
  title: string;
  description: string;
  unit: (key: string) => string;
};

const GROUPS: GroupDef[] = [
  {
    id: "moderation",
    title: "Модерация",
    description: "Поведение очереди и лимиты для модераторов.",
    unit: (key) => (key.includes("minutes") ? "мин" : key.includes("max_locks") ? "кейсов" : ""),
  },
  {
    id: "demo",
    title: "Демо-доступ",
    description: "Длительность бесплатного знакомства с платформой.",
    unit: (key) => (key.includes("hours") ? "ч" : ""),
  },
  {
    id: "indices",
    title: "Индексы цен",
    description: "Алгоритмы расчёта индексов и пороги.",
    unit: (key) => (key.includes("percent") ? "%" : ""),
  },
  {
    id: "other",
    title: "Прочее",
    description: "Настройки, не относящиеся к стандартным группам.",
    unit: () => "",
  },
];
const DEFAULT_GROUP = GROUPS[0]!;

const SERVICE_SECTIONS = [
  {
    id: "users",
    title: "Пользователи",
    description: "Управление учётными записями и платформенными ролями.",
  },
  {
    id: "journals",
    title: "Журнал действий",
    description: "Аудит действий администраторов.",
  },
] as const;

type ServiceSectionId = (typeof SERVICE_SECTIONS)[number]["id"];

function groupOf(key: string): string {
  const prefix = key.split(".")[0] ?? "other";
  return GROUPS.some((g) => g.id === prefix) ? prefix : "other";
}

function isSettingsSection(id: string) {
  return GROUPS.some((g) => g.id === id) || SERVICE_SECTIONS.some((section) => section.id === id);
}

function isServiceSection(id: string): id is ServiceSectionId {
  return SERVICE_SECTIONS.some((section) => section.id === id);
}

export function AdminSettingsView() {
  const { token } = useAuth();
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [items, setItems] = useState<SettingItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string>(() => {
    // Активная группа берётся из hash в URL, чтобы можно было дать ссылку
    // вида /admin/settings#moderation и она открылась нужной секцией.
    if (typeof window === "undefined") return "moderation";
    const fromHash = window.location.hash.replace("#", "");
    return isSettingsSection(fromHash) ? fromHash : "moderation";
  });

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

  // Синхронизация активной группы с hash при ручной смене URL пользователем.
  useEffect(() => {
    function onHashChange() {
      const fromHash = window.location.hash.replace("#", "");
      if (isSettingsSection(fromHash)) {
        setActiveGroup(fromHash);
      }
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Считаем, какие группы вообще имеют поля — пустые в навигации не показываем.
  const usedGroups = useMemo(() => {
    const ids = new Set(items.map((item) => groupOf(item.key)));
    return GROUPS.filter((g) => ids.has(g.id));
  }, [items]);

  function switchGroup(id: string) {
    setActiveGroup(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  }

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

  const groupDef = GROUPS.find((g) => g.id === activeGroup) ?? DEFAULT_GROUP;
  const groupItems = items.filter((item) => groupOf(item.key) === activeGroup);
  const activeService = isServiceSection(activeGroup) ? activeGroup : null;

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

        <div className="settings-layout">
          {/* Левая колонка — навигация по группам. Используется тот же
              визуальный язык, что и в табах CMS, но в вертикальной форме. */}
          <nav className="settings-nav" aria-label="Группы настроек">
            {usedGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={`settings-nav-item${activeGroup === group.id ? " active" : ""}`}
                onClick={() => switchGroup(group.id)}
              >
                <span className="settings-nav-title">{group.title}</span>
                <span className="settings-nav-count">{items.filter((it) => groupOf(it.key) === group.id).length}</span>
              </button>
            ))}
            {SERVICE_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-nav-item${activeGroup === section.id ? " active" : ""}`}
                onClick={() => switchGroup(section.id)}
              >
                <span className="settings-nav-title">{section.title}</span>
              </button>
            ))}
          </nav>

          {/* Правая колонка — содержимое выбранной группы. Каждая настройка —
              отдельная строка-карточка с понятной подписью и единицей. */}
          {activeService === "users" ? (
            <AdminUsersView embedded />
          ) : activeService === "journals" ? (
            <AdminJournalsView embedded />
          ) : (
            <div className="settings-pane">
              <header className="settings-pane-head">
                <h2 className="settings-pane-title">{groupDef.title}</h2>
                <p className="settings-pane-subtitle">{groupDef.description}</p>
              </header>

              <div className="settings-list">
                {groupItems.length === 0 ? (
                  <p className="page-subtitle">В этой группе пока нет настроек.</p>
                ) : null}
                {groupItems.map((item) => {
                  const unit = groupDef.unit(item.key);
                  const isDirty = drafts[item.key] !== String(item.value);
                  return (
                    <article className="setting-row" key={item.key}>
                      <div className="setting-row-info">
                        <strong className="setting-row-label">{item.label}</strong>
                        <p className="setting-row-description">{item.description}</p>
                        <small className="setting-row-meta">
                          По умолчанию: {item.defaultValue}
                          {unit ? ` ${unit}` : ""}
                          {item.updatedAt ? ` · Изменено ${new Date(item.updatedAt).toLocaleString("ru-RU")}` : ""}
                        </small>
                      </div>
                      <div className="setting-row-control">
                        <div className="setting-row-input">
                          <input
                            className="input"
                            onChange={(event) =>
                              setDrafts((prev) => ({ ...prev, [item.key]: event.target.value }))
                            }
                            type="number"
                            value={drafts[item.key] ?? ""}
                          />
                          {unit ? <span className="setting-row-unit">{unit}</span> : null}
                        </div>
                        <button
                          className="button"
                          disabled={savingKey === item.key || !isDirty}
                          onClick={() => save(item.key)}
                          type="button"
                        >
                          {savingKey === item.key ? "Сохраняю…" : "Сохранить"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
