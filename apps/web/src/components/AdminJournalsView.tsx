"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

type JournalEntry = {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  comment: string | null;
  payload: unknown;
  createdAt: string;
  actor: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

type JournalList = {
  total: number;
  page: number;
  take: number;
  items: JournalEntry[];
};

export function AdminJournalsView() {
  const { token } = useAuth();
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [list, setList] = useState<JournalList | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const take = 25;

  async function loadList(opts: { page?: number } = {}) {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      params.set("take", String(take));
      params.set("page", String(opts.page ?? page));
      if (action) params.set("action", action);
      if (entityType) params.set("entityType", entityType);
      if (actorId) params.set("actorId", actorId);
      if (from) params.set("from", new Date(from).toISOString());
      if (to) params.set("to", new Date(to).toISOString());
      const data = await apiFetch<JournalList>(`/admin/journals?${params.toString()}`, { token });
      setList(data);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить журнал");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    void loadList({ page: 1 });
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Журнал</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Журнал</h1>
          <p className="page-subtitle">Раздел доступен только администратору.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Журнал действий администраторов</h1>
          <p className="page-subtitle">Все изменения в админке фиксируются и доступны для аудита.</p>
        </header>

        <form className="form" onSubmit={submit}>
          <div className="auth-actions">
            <input
              className="input"
              onChange={(event) => setAction(event.target.value)}
              placeholder="Действие (например, admin.user.block)"
              value={action}
            />
            <input
              className="input"
              onChange={(event) => setEntityType(event.target.value)}
              placeholder="Тип сущности (User, Company, PlatformSetting…)"
              value={entityType}
            />
            <input
              className="input"
              onChange={(event) => setActorId(event.target.value)}
              placeholder="ID администратора"
              value={actorId}
            />
            <input
              className="input"
              onChange={(event) => setFrom(event.target.value)}
              placeholder="С даты"
              type="datetime-local"
              value={from}
            />
            <input
              className="input"
              onChange={(event) => setTo(event.target.value)}
              placeholder="По дату"
              type="datetime-local"
              value={to}
            />
            <button className="button" type="submit">
              Применить
            </button>
          </div>
        </form>

        {errorMessage ? <p className="status-pill">{errorMessage}</p> : null}
        {state === "loading" ? <p className="page-subtitle">Загрузка…</p> : null}

        {list ? (
          <div className="stack-list">
            <p className="page-subtitle">
              Всего записей: {list.total}, страница {list.page}.
            </p>
            {list.items.map((entry) => (
              <article className="checklist-block" key={entry.id}>
                <strong>{entry.action}</strong>
                <p>
                  {entry.entityType} · ID: {entry.entityId}
                </p>
                <p>
                  {new Date(entry.createdAt).toLocaleString("ru-RU")}
                  {entry.actor ? ` · ${entry.actor.firstName} ${entry.actor.lastName} (${entry.actor.email})` : ""}
                </p>
                {entry.comment ? <p>«{entry.comment}»</p> : null}
                {entry.payload ? (
                  <pre className="json-preview">{JSON.stringify(entry.payload, null, 2)}</pre>
                ) : null}
              </article>
            ))}

            <div className="auth-actions">
              <button
                className="button secondary"
                disabled={list.page <= 1}
                onClick={() => {
                  const next = list.page - 1;
                  setPage(next);
                  void loadList({ page: next });
                }}
                type="button"
              >
                ← Назад
              </button>
              <button
                className="button secondary"
                disabled={list.page * list.take >= list.total}
                onClick={() => {
                  const next = list.page + 1;
                  setPage(next);
                  void loadList({ page: next });
                }}
                type="button"
              >
                Дальше →
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
