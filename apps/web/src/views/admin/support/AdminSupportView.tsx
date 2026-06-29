"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw, Search } from "lucide-react";
import "../../../components/support-drawer.css";
import { AdminSortButton } from "../../../components/AdminSortButton";
import { AppShell } from "../../../components/AppShell";
import { StatusPill, supportStatusPillVariant } from "../../../components/StatusPill";
import { AdminPageHeader } from "../../../components/admin";
import { SendActionIcon } from "../../../components/app-shell/nav-icons";
import { sortItems, type SortState } from "../../../components/admin-table-utils";
import { errorText, apiFetch } from "../../../lib/api";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS } from "../../../lib/display-labels";
import { formatDateTime } from "../../../lib/formatters";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";
import { useAuth } from "../../../lib/auth";
import { useSupportAwaitingCount } from "../../../lib/support/use-support-queue";

// Inbox-режим админской поддержки: слева — список тикетов с фильтрами,
// справа — выбранный тикет с тредом и формой ответа. Раньше всё валилось
// в одну ленту, и просматривать длинные обращения было неудобно.

type Message = {
  id: string;
  text: string;
  createdAt: string;
  authorRole: string;
  author?: SupportMessageAuthor | null;
};

type SupportMessageAuthor = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

type Ticket = {
  id: string;
  category: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  company?: { id: string; organizationName: string; status: string } | null;
  author?: { id: string; email: string; firstName: string; lastName: string } | null;
  messages?: Message[];
};

type Filter = "all" | "active" | "new" | "in_progress" | "resolved";
type TicketSortKey = "updatedAt" | "subject" | "status" | "company";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "active", label: "Активные" },
  { id: "new", label: "Открытые" },
  { id: "in_progress", label: "В работе" },
  { id: "resolved", label: "Решённые" },
  { id: "all", label: "Все" },
];

const ticketSortSelectors: Record<TicketSortKey, (ticket: Ticket) => string | number> = {
  updatedAt: (ticket) => Date.parse(ticket.updatedAt),
  subject: (ticket) => ticket.subject,
  status: (ticket) => SUPPORT_STATUS_LABELS[ticket.status] ?? ticket.status,
  company: (ticket) => ticket.company?.organizationName ?? "",
};

function supportAuthorInitials(author: SupportMessageAuthor | null, fallbackLabel: string) {
  const nameParts = author ? [author.firstName, author.lastName].filter(Boolean) : [];
  const initials = nameParts
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  return (initials || fallbackLabel.trim()[0] || "?").toLocaleUpperCase("ru-RU");
}

function SupportChatAvatar({
  author,
  className,
  fallbackLabel,
}: {
  author: SupportMessageAuthor | null;
  className: string;
  fallbackLabel: string;
}) {
  const avatarUrl = author?.avatarUrl ?? null;

  return (
    <span
      className={`${className}${avatarUrl ? " has-image" : ""}`}
      style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
      aria-hidden="true"
    >
      {avatarUrl ? null : supportAuthorInitials(author, fallbackLabel)}
    </span>
  );
}

export function AdminSupportView() {
  const { token, user } = useAuth();
  const messagesRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState<TicketSortKey>>({ key: "updatedAt", direction: "desc" });
  const [result, setResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const ticketsQuery = useInfiniteApiQuery<Ticket>(
    token ? "admin-support-tickets" : null,
    50,
    async ({ limit, offset }) => {
      const queryString = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      return apiFetch<{ items: Ticket[]; total: number; hasMore: boolean }>(`/admin/support/tickets?${queryString}`, {
        token,
      });
    },
  );
  const tickets = ticketsQuery.items;
  const awaitingCount = useSupportAwaitingCount();

  const selectedId = searchParams?.get("ticketId") ?? null;

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      // Фильтр по статусу: «активные» — это всё, кроме resolved/closed.
      if (filter === "active" && (ticket.status === "resolved" || ticket.status === "closed")) {
        return false;
      }
      if (filter === "new" && ticket.status !== "new") return false;
      if (filter === "in_progress" && ticket.status !== "in_progress" && ticket.status !== "awaiting_user")
        return false;
      if (filter === "resolved" && ticket.status !== "resolved" && ticket.status !== "closed") return false;

      if (q) {
        const haystack = [
          ticket.subject,
          ticket.company?.organizationName,
          ticket.author?.email,
          ticket.author?.firstName,
          ticket.author?.lastName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, filter, query]);

  const sortedTickets = useMemo(() => sortItems(filteredTickets, sort, ticketSortSelectors), [filteredTickets, sort]);
  const selectedTicket = useMemo(() => tickets.find((t) => t.id === selectedId) ?? null, [tickets, selectedId]);
  const hasActiveFilters = filter !== "all" || Boolean(query.trim());
  const currentAdminAuthor: SupportMessageAuthor | null = user
    ? {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
      }
    : null;

  useEffect(() => {
    const list = messagesRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [selectedTicket?.id, selectedTicket?.messages?.length]);

  function resetFilters() {
    setFilter("active");
    setQuery("");
  }

  function selectTicket(id: string | null) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (id) {
      params.set("ticketId", id);
    } else {
      params.delete("ticketId");
    }
    router.replace(`/admin/support${params.toString() ? `?${params.toString()}` : ""}`);
  }

  async function onReply(event: FormEvent<HTMLFormElement>, ticketId: string) {
    event.preventDefault();
    if (!token) {
      setResult("Сначала войдите как администратор.");
      return;
    }
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const text = String(form.get("text") ?? "").trim();
    if (!text) return;
    setSending(true);
    setResult(null);
    try {
      await apiFetch(`/admin/support/tickets/${ticketId}/replies`, {
        method: "POST",
        token,
        body: { text },
      });
      formElement.reset();
      ticketsQuery.reload();
    } catch (error) {
      setResult(errorText(error, "Не удалось отправить ответ."));
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell>
      <section className="page">
        <AdminPageHeader
          count={ticketsQuery.state === "ready" || tickets.length > 0 ? ticketsQuery.total : undefined}
          subtitle="Очередь обращений компаний. Слева — список, справа — переписка."
          title="Поддержка"
        />

        {awaitingCount > 0 ? (
          <StatusPill as="p" variant="warning">
            Ждут ответа: {awaitingCount}
          </StatusPill>
        ) : null}

        {result ? (
          <StatusPill as="p" variant="danger">
            {result}
          </StatusPill>
        ) : null}

        <div className="support-inbox">
          {/* Левая колонка: фильтры по статусам, поиск, список тикетов. */}
          <aside className="support-inbox-list">
            <div className="support-inbox-filters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`support-inbox-chip${filter === f.id ? " active" : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="support-inbox-search">
              <Search size={14} aria-hidden />
              <input
                aria-label="Поиск обращений"
                className="input"
                placeholder="Поиск по теме, компании, автору"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
              />
            </div>
            <div className="support-inbox-sort">
              <AdminSortButton label="Тема" sort={sort} sortKey="subject" onSort={setSort} />
              <AdminSortButton label="Статус" sort={sort} sortKey="status" onSort={setSort} />
              <AdminSortButton label="Компания" sort={sort} sortKey="company" onSort={setSort} />
              <AdminSortButton defaultDirection="desc" label="Дата" sort={sort} sortKey="updatedAt" onSort={setSort} />
            </div>
            <ul className="support-inbox-items">
              {sortedTickets.length === 0 ? (
                <li className="support-inbox-empty">
                  <p>{hasActiveFilters ? "По текущим фильтрам обращений нет." : "Обращений пока нет."}</p>
                  {hasActiveFilters ? (
                    <button className="button secondary" onClick={resetFilters} type="button">
                      <RotateCcw aria-hidden size={16} />
                      Очистить
                    </button>
                  ) : null}
                </li>
              ) : null}
              {sortedTickets.map((ticket) => {
                const last = ticket.messages?.[ticket.messages.length - 1];
                const preview = last?.text ?? "";
                return (
                  <li key={ticket.id}>
                    <button
                      type="button"
                      className={`support-inbox-item${selectedId === ticket.id ? " active" : ""}`}
                      onClick={() => selectTicket(ticket.id)}
                    >
                      <div className="support-inbox-item-head">
                        <strong>{ticket.subject}</strong>
                        <StatusPill variant={supportStatusPillVariant(ticket.status)}>
                          {SUPPORT_STATUS_LABELS[ticket.status] ?? ticket.status}
                        </StatusPill>
                      </div>
                      <span className="support-inbox-item-company">
                        {ticket.company?.organizationName ?? "—"} ·{" "}
                        {SUPPORT_CATEGORY_LABELS[ticket.category] ?? ticket.category}
                      </span>
                      {preview ? <span className="support-inbox-item-preview">{preview}</span> : null}
                      <span className="support-inbox-item-time">
                        <time dateTime={ticket.updatedAt}>{formatDateTime(ticket.updatedAt)}</time>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div ref={ticketsQuery.sentinelRef} aria-hidden="true" />
            {ticketsQuery.isLoadingMore ? <p className="page-subtitle">Загружаем ещё…</p> : null}
            {!ticketsQuery.hasMore && tickets.length > 0 ? <p className="page-subtitle">Это все обращения.</p> : null}
          </aside>

          {/* Правая колонка: выбранный тикет, его сообщения и форма ответа. */}
          <div className="support-inbox-pane">
            {!selectedTicket ? (
              <div className="support-inbox-placeholder">
                <p>Выберите обращение в списке слева, чтобы прочитать переписку.</p>
              </div>
            ) : (
              <>
                <header className="support-inbox-head">
                  <div>
                    <h2>{selectedTicket.subject}</h2>
                    <p className="page-subtitle">
                      {selectedTicket.company?.organizationName}
                      {selectedTicket.author
                        ? ` · ${selectedTicket.author.firstName} ${selectedTicket.author.lastName} (${selectedTicket.author.email})`
                        : ""}
                    </p>
                  </div>
                  <div className="support-inbox-meta">
                    <StatusPill variant={supportStatusPillVariant(selectedTicket.status)}>
                      {SUPPORT_STATUS_LABELS[selectedTicket.status] ?? selectedTicket.status}
                    </StatusPill>
                    <StatusPill>
                      {SUPPORT_CATEGORY_LABELS[selectedTicket.category] ?? selectedTicket.category}
                    </StatusPill>
                  </div>
                </header>

                <div className="support-drawer-chat-surface support-inbox-chat-surface">
                  <div
                    aria-label="История переписки"
                    aria-live="polite"
                    aria-relevant="additions text"
                    className="support-drawer-messages support-inbox-thread"
                    ref={messagesRef}
                    role="log"
                    tabIndex={(selectedTicket.messages ?? []).length > 0 ? 0 : undefined}
                  >
                    {(selectedTicket.messages ?? []).length === 0 ? (
                      <p className="support-drawer-thread-empty">Сообщений пока нет.</p>
                    ) : null}
                    {(selectedTicket.messages ?? []).map((m) => {
                      const isAdminReply = m.authorRole === "admin";
                      const authorLabel = isAdminReply ? "Поддержка" : "Клиент";
                      const messageAuthor = m.author ?? (isAdminReply ? currentAdminAuthor : null);

                      return (
                        <article key={m.id} className={`support-drawer-message${isAdminReply ? " from-user" : ""}`}>
                          <SupportChatAvatar
                            author={messageAuthor}
                            className="support-drawer-message-avatar"
                            fallbackLabel={authorLabel}
                          />
                          <div className="support-drawer-message-bubble">
                            <header className="support-drawer-message-head">
                              <strong>{authorLabel}</strong>
                              <time className="support-drawer-message-time" dateTime={m.createdAt}>
                                {formatDateTime(m.createdAt)}
                              </time>
                            </header>
                            <p>{m.text}</p>
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <form
                    className="support-drawer-reply support-inbox-reply"
                    onSubmit={(event) => onReply(event, selectedTicket.id)}
                  >
                    <SupportChatAvatar
                      author={currentAdminAuthor}
                      className="support-drawer-composer-avatar"
                      fallbackLabel="Поддержка"
                    />
                    <div className="support-drawer-composer-body">
                      <label className="support-drawer-sr-only" htmlFor={`admin-support-reply-${selectedTicket.id}`}>
                        Ответ клиенту
                      </label>
                      <textarea
                        className="support-drawer-textarea"
                        id={`admin-support-reply-${selectedTicket.id}`}
                        name="text"
                        placeholder="Ответ клиенту"
                        required
                        rows={2}
                      />
                      <button
                        aria-label={sending ? "Отправляем ответ" : "Ответить"}
                        className="button support-drawer-submit"
                        disabled={sending}
                        title={sending ? "Отправляем ответ" : "Ответить"}
                        type="submit"
                      >
                        <SendActionIcon size={22} />
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
