"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../../components/AppShell";
import { StatusPill } from "../../../components/StatusPill";
import { AdminPageHeader } from "../../../components/admin";
import { errorText, apiFetch } from "../../../lib/api";
import { queryKeys } from "../../../lib/query/keys";
import { useApiQuery } from "../../shared";
import { useAuth } from "../../../lib/auth";
import { hasStaleAuthFeaturesAfterSettingsLoad, shouldRefreshAuthAfterSettingChange } from "./settings-auth-refresh";

type SettingItem = {
  key: string;
  type: "number" | "boolean";
  label: string;
  description: string;
  defaultValue: number | boolean;
  value: number | boolean;
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
    id: "auth",
    title: "Регистрация",
    description: "Доступ новых пользователей к регистрации на платформе.",
    unit: () => "",
  },
  {
    id: "support",
    title: "Поддержка",
    description: "Приём новых обращений пользователей.",
    unit: () => "",
  },
  {
    id: "discussions",
    title: "Сообщество",
    description: "Комментарии и обсуждения на платформе.",
    unit: () => "",
  },
  {
    id: "marketplace",
    title: "Торговая площадка",
    description: "Доступ к разделу объявлений на время закрытого тестирования.",
    unit: () => "",
  },
  {
    id: "security",
    title: "Безопасность",
    description: "Защита от перебора пароля и проверка паролей по утечкам.",
    unit: (key) => (key.includes("minutes") ? "мин" : key.includes("threshold") ? "попыток" : ""),
  },
  {
    id: "files",
    title: "Файлы",
    description: "Лимиты на размер загрузок и дневную квоту.",
    unit: () => "МБ",
  },
  {
    id: "other",
    title: "Прочее",
    description: "Настройки, не относящиеся к стандартным группам.",
    unit: () => "",
  },
];
const DEFAULT_GROUP = GROUPS[0]!;

function groupOf(key: string): string {
  const prefix = key.split(".")[0] ?? "other";
  return GROUPS.some((g) => g.id === prefix) ? prefix : "other";
}

function isSettingsSection(id: string) {
  return GROUPS.some((g) => g.id === id);
}

export function AdminSettingsView() {
  const { user, refreshMe } = useAuth();
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
  const {
    data: items,
    state,
    errorMessage: readError,
    refetch,
  } = useApiQuery<SettingItem[]>(queryKeys.admin.settings(), () => apiFetch<SettingItem[]>("/admin/settings"), []);

  // Драфты-инпуты пересеваем значениями с сервера при каждой загрузке/
  // обновлении настроек (в т.ч. после сохранения — refetch обновит items).
  useEffect(() => {
    setDrafts(Object.fromEntries(items.map((item) => [item.key, String(item.value)])));
  }, [items]);

  async function saveValue(key: string, value: number | boolean) {
    setSavingKey(key);
    setErrorMessage(null);
    try {
      await apiFetch(`/admin/settings/${key}`, { method: "PATCH", body: { value } });
      await refetch();
      if (shouldRefreshAuthAfterSettingChange(key)) {
        await refreshMe();
      }
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось сохранить настройку"));
    } finally {
      setSavingKey(null);
    }
  }

  async function save(key: string) {
    const num = Number(drafts[key]);
    if (Number.isNaN(num)) {
      setErrorMessage("Значение должно быть числом.");
      return;
    }
    await saveValue(key, num);
  }

  useEffect(() => {
    if (hasStaleAuthFeaturesAfterSettingsLoad(items, user?.features)) {
      void refreshMe();
    }
  }, [items, user?.features, refreshMe]);

  // Синхронизация активной группы с hash.
  useEffect(() => {
    function syncFromHash() {
      const fromHash = window.location.hash.replace("#", "");
      setActiveGroup(isSettingsSection(fromHash) ? fromHash : "moderation");
    }
    // Важно прочитать hash ПОСЛЕ монтирования: при переходе по ссылке вида
    // /admin/settings#demo Next-навигация меняет hash через pushState, который
    // НЕ вызывает событие hashchange, а ленивый useState-инициализатор успевает
    // прочитать ещё пустой window.location.hash и падает в дефолт «moderation».
    // Этот вызов гарантированно подхватывает актуальный hash из URL.
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    window.addEventListener("popstate", syncFromHash);
    return () => {
      window.removeEventListener("hashchange", syncFromHash);
      window.removeEventListener("popstate", syncFromHash);
    };
  }, []);

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
  // Показываем вкладки только для групп, где реально есть настройки.
  const availableGroups = GROUPS.filter((group) => items.some((item) => groupOf(item.key) === group.id));

  function selectGroup(id: string) {
    setActiveGroup(id);
    if (typeof window !== "undefined") {
      // Обновляем hash, чтобы вкладка оставалась в URL (ссылку можно дать), но
      // без замусоривания истории отдельной записью на каждый клик.
      window.history.replaceState(null, "", `#${id}`);
    }
  }

  return (
    <AppShell>
      <section className="page">
        <AdminPageHeader
          subtitle="Параметры, которые раньше были жёстко прописаны в коде. Сохранение действует моментально."
          title="Настройки платформы"
        />

        {(errorMessage ?? readError) ? (
          <StatusPill as="p" variant="danger">
            {errorMessage ?? readError}
          </StatusPill>
        ) : null}
        {state === "loading" ? <p className="page-subtitle">Загрузка…</p> : null}

        {availableGroups.length > 0 ? (
          <nav className="settings-tabs" aria-label="Разделы настроек">
            {availableGroups.map((group) => (
              <button
                aria-current={group.id === activeGroup ? "page" : undefined}
                className={`settings-tab${group.id === activeGroup ? " is-active" : ""}`}
                key={group.id}
                onClick={() => selectGroup(group.id)}
                type="button"
              >
                {group.title}
              </button>
            ))}
          </nav>
        ) : null}

        <div className="settings-pane">
          <header className="settings-pane-head">
            <h2 className="settings-pane-title">{groupDef.title}</h2>
            <p className="settings-pane-subtitle">{groupDef.description}</p>
          </header>

          <div className="settings-list">
            {groupItems.length === 0 ? <p className="page-subtitle">В этой группе пока нет настроек.</p> : null}
            {groupItems.map((item) => {
              const unit = groupDef.unit(item.key);
              const isBoolean = item.type === "boolean";
              const isDirty = !isBoolean && drafts[item.key] !== String(item.value);
              const defaultLabel = isBoolean
                ? item.defaultValue
                  ? "Включено"
                  : "Выключено"
                : `${item.defaultValue}${unit ? ` ${unit}` : ""}`;
              return (
                <article className="setting-row" key={item.key}>
                  <div className="setting-row-info">
                    <strong className="setting-row-label">{item.label}</strong>
                    <p className="setting-row-description">{item.description}</p>
                    <small className="setting-row-meta">
                      По умолчанию: {defaultLabel}
                      {item.updatedAt ? ` · Изменено ${new Date(item.updatedAt).toLocaleString("ru-RU")}` : ""}
                    </small>
                  </div>
                  <div className="setting-row-control">
                    {isBoolean ? (
                      <label className="setting-toggle">
                        <input
                          checked={Boolean(item.value)}
                          disabled={savingKey === item.key}
                          onChange={(event) => saveValue(item.key, event.target.checked)}
                          type="checkbox"
                        />
                        <span>{item.value ? "Включено" : "Выключено"}</span>
                      </label>
                    ) : (
                      <>
                        <div className="setting-row-input">
                          <input
                            className="input"
                            onChange={(event) => setDrafts((prev) => ({ ...prev, [item.key]: event.target.value }))}
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
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
