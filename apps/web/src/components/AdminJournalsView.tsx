"use client";

import { FormEvent, useState } from "react";
import type { AdminJournalEntry, AdminJournalPayload, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "./AppShell";
import { StatusPill } from "./StatusPill";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";

type JournalList = PaginatedResponse<AdminJournalEntry>;

type AdminJournalsViewProps = {
  embedded?: boolean;
};

export function AdminJournalsView({ embedded = false }: AdminJournalsViewProps) {
  const { token } = useAuth();
  const [errorMessage] = useState<string | null>(null);

  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [actorId, setActorId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [filters, setFilters] = useState({ action: "", entityType: "", actorId: "", from: "", to: "" });
  const take = 25;
  const journalsQuery = useInfiniteApiQuery<AdminJournalEntry>(
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
        <StatusPill as="p" variant="danger">
          {errorMessage ?? journalsQuery.errorMessage}
        </StatusPill>
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
                {entry.actor ? ` · ${formatActor(entry.actor)}` : ""}
              </p>
              {entry.comment ? <p>«{entry.comment}»</p> : null}
              <PayloadView payload={entry.payload} />
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

function formatActor(actor: NonNullable<AdminJournalEntry["actor"]>) {
  const name = [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim();
  return name ? `${name} (${actor.email})` : actor.email;
}

function PayloadView({ payload }: { payload: AdminJournalPayload | null }) {
  if (!payload) return null;

  const diff = payload.diff;
  const hasDiff = diff && Object.keys(diff).length > 0;
  const extra = Object.fromEntries(
    Object.entries(payload).filter(([key]) => key !== "before" && key !== "after" && key !== "diff"),
  );
  const hasExtra = Object.keys(extra).length > 0;

  if (!hasDiff && !hasExtra && !payload.before && !payload.after) {
    return null;
  }

  return (
    <div className="audit-payload">
      {hasDiff ? (
        <dl className="audit-diff">
          {Object.entries(diff!).map(([key, change]) => (
            <div className="audit-diff-row" key={key}>
              <dt className="audit-diff-key">{key}</dt>
              <dd className="audit-diff-values">
                <span className="audit-diff-before">{renderValue(change.before)}</span>
                <span className="audit-diff-arrow" aria-hidden="true">
                  →
                </span>
                <span className="audit-diff-after">{renderValue(change.after)}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {!hasDiff && (payload.before || payload.after) ? (
        <p className="page-subtitle">Изменений в полях не зафиксировано.</p>
      ) : null}

      {hasExtra ? <pre className="audit-payload-extra">{JSON.stringify(extra, null, 2)}</pre> : null}
    </div>
  );
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value || '""';
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? value.map(renderValue).join(", ") : "[]";
  return JSON.stringify(value);
}
