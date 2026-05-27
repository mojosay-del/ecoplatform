"use client";

import { FormEvent, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { AdminJournalEntry, AdminJournalPayload, PaginatedResponse } from "@ecoplatform/shared";
import { AdminSortButton } from "./AdminSortButton";
import { AppShell } from "./AppShell";
import { StatusPill } from "./StatusPill";
import { getJournalEntityDisplay } from "./admin-entity-display";
import { sortItems, type SortState } from "./admin-table-utils";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { formatAuditFieldLabel, formatAuditValue } from "../lib/display-labels";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";

type JournalList = PaginatedResponse<AdminJournalEntry>;
type JournalSortKey = "createdAt" | "action" | "entity" | "actor";

type AdminJournalsViewProps = {
  embedded?: boolean;
};

const journalSortSelectors: Record<JournalSortKey, (item: AdminJournalEntry) => string | number> = {
  createdAt: (item) => Date.parse(item.createdAt),
  action: (item) => item.action,
  entity: (item) => {
    const entity = getJournalEntityDisplay(item);
    return `${entity.typeLabel} ${entity.title} ${entity.subtitle ?? ""}`;
  },
  actor: (item) => (item.actor ? formatActor(item.actor) : ""),
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
  const [sort, setSort] = useState<SortState<JournalSortKey>>({ key: "createdAt", direction: "desc" });
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

  function resetFilters() {
    setAction("");
    setEntityType("");
    setActorId("");
    setFrom("");
    setTo("");
    setFilters({ action: "", entityType: "", actorId: "", from: "", to: "" });
  }

  const sortedEntries = useMemo(
    () => sortItems(journalsQuery.items, sort, journalSortSelectors),
    [journalsQuery.items, sort],
  );
  const hasActiveFilters = Boolean(
    filters.action || filters.entityType || filters.actorId || filters.from || filters.to,
  );

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

      <form className="admin-filter-bar" onSubmit={submit}>
        <input
          aria-label="Фильтр по действию"
          className="input"
          onChange={(event) => setAction(event.target.value)}
          placeholder="Действие"
          value={action}
        />
        <input
          aria-label="Фильтр по типу сущности"
          className="input"
          onChange={(event) => setEntityType(event.target.value)}
          placeholder="Тип сущности"
          value={entityType}
        />
        <input
          aria-label="Фильтр по ID администратора"
          className="input"
          onChange={(event) => setActorId(event.target.value)}
          placeholder="ID администратора"
          value={actorId}
        />
        <input
          aria-label="Дата начала"
          className="input"
          onChange={(event) => setFrom(event.target.value)}
          placeholder="С даты"
          type="datetime-local"
          value={from}
        />
        <input
          aria-label="Дата окончания"
          className="input"
          onChange={(event) => setTo(event.target.value)}
          placeholder="По дату"
          type="datetime-local"
          value={to}
        />
        <div className="admin-filter-actions">
          <button className="button" type="submit">
            Применить
          </button>
          <button className="button secondary" onClick={resetFilters} type="button">
            <RotateCcw aria-hidden size={16} />
            Сбросить
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
        <div className="admin-table-shell">
          <div className="admin-table-meta">
            <p className="page-subtitle">
              Загружено {journalsQuery.items.length} из {journalsQuery.total}.
            </p>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table admin-journal-table">
              <thead>
                <tr>
                  <th scope="col">
                    <AdminSortButton
                      defaultDirection="desc"
                      label="Дата"
                      sort={sort}
                      sortKey="createdAt"
                      onSort={setSort}
                    />
                  </th>
                  <th scope="col">
                    <AdminSortButton label="Действие" sort={sort} sortKey="action" onSort={setSort} />
                  </th>
                  <th scope="col">
                    <AdminSortButton label="Сущность" sort={sort} sortKey="entity" onSort={setSort} />
                  </th>
                  <th scope="col">Diff</th>
                  <th scope="col">
                    <AdminSortButton label="Администратор" sort={sort} sortKey="actor" onSort={setSort} />
                  </th>
                  <th scope="col">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry) => {
                  const entity = getJournalEntityDisplay(entry);
                  return (
                    <tr key={entry.id}>
                      <td>{new Date(entry.createdAt).toLocaleString("ru-RU")}</td>
                      <td>
                        <strong>{entry.action}</strong>
                      </td>
                      <td>
                        <div className="admin-table-cell-main">
                          <strong>{entity.typeLabel}</strong>
                          <span>{entity.title}</span>
                          {entity.subtitle ? <span className="admin-table-muted">{entity.subtitle}</span> : null}
                          <span className="technical-id">ID: {entity.technicalId}</span>
                        </div>
                      </td>
                      <td>
                        <PayloadView payload={entry.payload} />
                      </td>
                      <td>{entry.actor ? formatActor(entry.actor) : "—"}</td>
                      <td>{entry.comment ? `«${entry.comment}»` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sortedEntries.length === 0 && !journalsQuery.isInitialLoading ? (
            <div className="admin-empty-state">
              <p>{hasActiveFilters ? "По текущим фильтрам записей нет." : "Записей журнала пока нет."}</p>
              {hasActiveFilters ? (
                <button className="button secondary" onClick={resetFilters} type="button">
                  Очистить фильтры
                </button>
              ) : null}
            </div>
          ) : null}

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
              <dt className="audit-diff-key">{formatAuditFieldLabel(key)}</dt>
              <dd className="audit-diff-values">
                <span className="audit-diff-before">{renderValue(change.before, key)}</span>
                <span className="audit-diff-arrow" aria-hidden="true">
                  →
                </span>
                <span className="audit-diff-after">{renderValue(change.after, key)}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {!hasDiff && (payload.before || payload.after) ? (
        <p className="page-subtitle">Изменений в полях не зафиксировано.</p>
      ) : null}

      {hasExtra ? (
        <pre className="audit-payload-extra">{JSON.stringify(formatExtraPayload(extra), null, 2)}</pre>
      ) : null}
    </div>
  );
}

function renderValue(value: unknown, key: string): string {
  return formatAuditValue(key, value);
}

function formatExtraPayload(value: unknown, key = ""): unknown {
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => formatExtraPayload(item, key));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, formatExtraPayload(childValue, childKey)]),
    );
  }

  if (typeof value === "string") {
    const formatted = formatAuditValue(key, value);
    return formatted === '""' ? "" : formatted;
  }

  return value;
}
