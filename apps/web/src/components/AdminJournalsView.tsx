"use client";

import { FormEvent, useState } from "react";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "./AppShell";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";

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

type JournalList = PaginatedResponse<JournalEntry>;

type AdminJournalsViewProps = {
  embedded?: boolean;
};

export function AdminJournalsView({ embedded = false }: AdminJournalsViewProps) {
  const { token } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filters, setFilters] = useState({ action: "", entityType: "", actorId: "", from: "", to: "" });
  const take = 25;
  const journalsQuery = useInfiniteApiQuery<JournalEntry>(
    token
      ? `admin-journals:${filters.action}:${filters.entityType}:${filters.actorId}:${filters.from}:${filters.to}`
      : null,
    take,
    async ({ limit, offset }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (filters.action) params.set("action", filters.action);
      if (filters.entityType) params.set("entityType", filters.entityType);
      if (filters.actorId) params.set("actorId", filters.actorId);
      if (filters.from) params.set("from", new Date(filters.from).toISOString());
      if (filters.to) params.set("to", new Date(filters.to).toISOString());
      return apiFetch<JournalList>(`/admin/journals?${params.toString()}`, { token });
    },
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ action: action.trim(), entityType: entityType.trim(), actorId: actorId.trim(), from, to });
  }

  if (!token || journalsQuery.state === "unauthenticated") {
    const content = (
      <>
        <h1 className="page-title">Журнал</h1>
        <p className="page-subtitle">Войдите как администратор.</p>
      </>
    );
    return embedded ? (
      <div className="settings-pane">{content}</div>
    ) : (
      <AppShell>
        <section className="page">{content}</section>
      </AppShell>
    );
  }

  if (journalsQuery.state === "forbidden") {
    const content = (
      <>
        <h1 className="page-title">Журнал</h1>
        <p className="page-subtitle">Раздел доступен только администратору.</p>
      </>
    );
    return embedded ? (
      <div className="settings-pane">{content}</div>
    ) : (
      <AppShell>
        <section className="page">{content}</section>
      </AppShell>
    );
  }

  const content = (
    <>
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

      {errorMessage || journalsQuery.errorMessage ? (
        <p className="status-pill">{errorMessage ?? journalsQuery.errorMessage}</p>
      ) : null}
      {journalsQuery.isInitialLoading ? <p className="page-subtitle">Загрузка…</p> : null}

      {journalsQuery.state === "ready" || journalsQuery.items.length > 0 ? (
        <div className="stack-list">
          <p className="page-subtitle">
            Загружено {journalsQuery.items.length} из {journalsQuery.total}.
          </p>
          {journalsQuery.items.map((entry) => (
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
              {entry.payload ? <pre className="json-preview">{JSON.stringify(entry.payload, null, 2)}</pre> : null}
            </article>
          ))}

          <div ref={journalsQuery.sentinelRef} aria-hidden="true" />
          {journalsQuery.isLoadingMore ? <p className="page-subtitle">Загружаем ещё…</p> : null}
          {!journalsQuery.hasMore && journalsQuery.items.length > 0 ? (
            <p className="page-subtitle">Это все записи.</p>
          ) : null}
        </div>
      ) : null}
    </>
  );

  return embedded ? (
    <div className="settings-pane settings-pane-wide">{content}</div>
  ) : (
    <AppShell>
      <section className="page">{content}</section>
    </AppShell>
  );
}
