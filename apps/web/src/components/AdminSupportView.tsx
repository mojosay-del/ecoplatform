"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { AppShell } from "./AppShell";
import { apiFetch } from "../lib/api";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";
import { useAuth } from "../lib/auth";

// Inbox-режим админской поддержки: слева — список тикетов с фильтрами,
// справа — выбранный тикет с тредом и формой ответа. Раньше всё валилось
// в одну ленту, и просматривать длинные обращения было неудобно.

type Message = {
  id: string;
  text: string;
  createdAt: string;
  authorRole: string;
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

const STATUS_LABELS: Record<string, string> = {
  open: "Открыт",
  in_progress: "В работе",
  awaiting_user: "Ждёт ответа",
  resolved: "Решён",
  closed: "Закрыт",
};

const CATEGORY_LABELS: Record<string, string> = {
  billing: "Биллинг",
  moderation_review: "Модерация",
  company_management: "Компания",
  technical: "Технический вопрос",
  data_deletion: "Удаление данных",
  other: "Другое",
};

type Filter = "all" | "active" | "open" | "in_progress" | "resolved";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "active", label: "Активные" },
  { id: "open", label: "Открытые" },
  { id: "in_progress", label: "В работе" },
  { id: "resolved", label: "Решённые" },
  { id: "all", label: "Все" },
];

export function AdminSupportView() {
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const ticketsQuery = useInfiniteApiQuery<Ticket>(token ? "admin-support-tickets" : null, 50, async ({
    limit,
    offset,
  }) => {
    const queryString = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return apiFetch<{ items: Ticket[]; total: number; hasMore: boolean }>(`/admin/support/tickets?${queryString}`, {
      token,
    });
  });
  const tickets = ticketsQuery.items;

  const selectedId = searchParams?.get("ticketId") ?? null;

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      // Фильтр по статусу: «активные» — это всё, кроме resolved/closed.
      if (filter === "active" && (ticket.status === "resolved" || ticket.status === "closed")) {
        return false;
      }
      if (filter === "open" && ticket.status !== "open") return false;
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

  const selectedTicket = useMemo(() => tickets.find((t) => t.id === selectedId) ?? null, [tickets, selectedId]);

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
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
      ticketsQuery.reload();
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Не удалось отправить ответ.");
    } finally {
      setSending(false);
    }
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Поддержка администратора</h1>
          <p className="page-subtitle">Очередь обращений компаний. Слева — список, справа — переписка.</p>
        </header>

        {result ? <p className="status-pill">{result}</p> : null}

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
                className="input"
                placeholder="Поиск по теме, компании, автору"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
              />
            </div>
            <ul className="support-inbox-items">
              {filteredTickets.length === 0 ? <li className="support-inbox-empty">Ничего не найдено.</li> : null}
              {filteredTickets.map((ticket) => {
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
                        <span className={`status-pill status-${ticket.status}`}>
                          {STATUS_LABELS[ticket.status] ?? ticket.status}
                        </span>
                      </div>
                      <span className="support-inbox-item-company">{ticket.company?.organizationName ?? "—"}</span>
                      {preview ? <span className="support-inbox-item-preview">{preview}</span> : null}
                      <span className="support-inbox-item-time">
                        {new Date(ticket.updatedAt).toLocaleString("ru-RU")}
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
                    <span className={`status-pill status-${selectedTicket.status}`}>
                      {STATUS_LABELS[selectedTicket.status] ?? selectedTicket.status}
                    </span>
                    <span className="status-pill">
                      {CATEGORY_LABELS[selectedTicket.category] ?? selectedTicket.category}
                    </span>
                  </div>
                </header>

                <div className="support-inbox-thread">
                  {(selectedTicket.messages ?? []).length === 0 ? (
                    <p className="page-subtitle">Сообщений пока нет.</p>
                  ) : null}
                  {(selectedTicket.messages ?? []).map((m) => (
                    <div key={m.id} className={`support-inbox-message${m.authorRole === "admin" ? " from-admin" : ""}`}>
                      <span className="support-inbox-message-author">
                        {m.authorRole === "admin" ? "Поддержка" : "Клиент"}
                      </span>
                      <p>{m.text}</p>
                      <small>{new Date(m.createdAt).toLocaleString("ru-RU")}</small>
                    </div>
                  ))}
                </div>

                <form className="support-inbox-reply" onSubmit={(event) => onReply(event, selectedTicket.id)}>
                  <textarea className="textarea" name="text" placeholder="Ответ клиенту" required rows={3} />
                  <button className="button" type="submit" disabled={sending}>
                    {sending ? "Отправляю…" : "Ответить"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
