"use client";

import { FormEvent, useEffect, useState } from "react";
import { ChevronLeft, MessageSquare, Plus, X } from "lucide-react";
import { supportTicketCategories } from "@ecoplatform/shared";
import "./support-drawer.css";
import { SendActionIcon } from "./app-shell/nav-icons";
import { StatusPill, supportStatusPillVariant } from "./StatusPill";
import { api, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS } from "../lib/display-labels";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";

// Drawer (правая выезжающая панель), открываемый по иконке «?» в шапке.
// Цель — дать обычному пользователю быстрый доступ к поддержке без
// перехода в кабинет: посмотреть свои обращения и завести новое в одном
// окне, не теряя контекст текущей страницы.

type Message = {
  id: string;
  text: string;
  createdAt: string;
  authorRole?: string;
};

type Ticket = {
  id: string;
  category: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
};

type DrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function UserSupportDrawer({ open, onClose }: DrawerProps) {
  const { token } = useAuth();
  const [tab, setTab] = useState<"list" | "new">("list");
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const ticketsQuery = useInfiniteApiQuery<Ticket>(
    open && token ? "support-drawer-tickets" : null,
    30,
    ({ limit, offset }) =>
      api.support.listMyTickets({ limit, offset }) as Promise<{ items: Ticket[]; total: number; hasMore: boolean }>,
  );
  const tickets = ticketsQuery.items;

  // Подгружаем список при открытии drawer'а и подписываемся на
  // глобальное событие — если где-то ещё в приложении создадут тикет,
  // список обновится.
  useEffect(() => {
    if (!open) return;
    const handler = () => ticketsQuery.reload();
    window.addEventListener("support:changed", handler);
    return () => window.removeEventListener("support:changed", handler);
  }, [open, ticketsQuery.reload]);

  // Закрытие по Escape — стандартная пользовательская привычка для модалок.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Блокируем прокрутку body, чтобы фон не уезжал под drawer'ом.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setSubmitting(true);
    setMessage(null);
    try {
      await apiFetch("/support/tickets", {
        method: "POST",
        token,
        body: {
          category: String(form.get("category")),
          subject: String(form.get("subject")),
          text: String(form.get("text")),
        },
      });
      formElement.reset();
      setMessage("Обращение создано. Мы ответим в ближайшее время.");
      // Переключаемся на список, чтобы пользователь увидел свежий тикет.
      ticketsQuery.reload();
      setTab("list");
      window.dispatchEvent(new Event("support:changed"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать обращение.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const activeTicket = tickets.find((t) => t.id === activeTicketId) ?? null;

  return (
    <div className="support-drawer-root" role="dialog" aria-modal="true" aria-label="Поддержка">
      <div className="support-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="support-drawer">
        <header className="support-drawer-head">
          <h2 className="support-drawer-title">
            {activeTicket ? (
              <button
                type="button"
                className="support-drawer-back"
                onClick={() => setActiveTicketId(null)}
                aria-label="Назад к списку"
              >
                <ChevronLeft size={18} /> Обращения
              </button>
            ) : (
              <>Поддержка</>
            )}
          </h2>
          <button type="button" className="support-drawer-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </header>

        {activeTicket ? (
          <TicketThread
            ticket={activeTicket}
            onReplied={() => {
              ticketsQuery.reload();
            }}
          />
        ) : (
          <>
            <nav className="support-drawer-tabs" aria-label="Разделы поддержки">
              <button
                type="button"
                className={`support-drawer-tab${tab === "list" ? " active" : ""}`}
                onClick={() => setTab("list")}
              >
                <MessageSquare size={14} /> Мои обращения
              </button>
              <button
                type="button"
                className={`support-drawer-tab${tab === "new" ? " active" : ""}`}
                onClick={() => setTab("new")}
              >
                <Plus size={14} /> Новое обращение
              </button>
            </nav>

            {tab === "list" ? (
              <div className="support-drawer-body">
                {ticketsQuery.isInitialLoading ? <p className="page-subtitle">Загружаем…</p> : null}
                {!ticketsQuery.isInitialLoading && tickets.length === 0 ? (
                  <div className="support-drawer-empty">
                    <p>У вас пока нет обращений в поддержку.</p>
                    <button type="button" className="button" onClick={() => setTab("new")}>
                      Создать первое
                    </button>
                  </div>
                ) : null}
                <ul className="support-drawer-list">
                  {tickets.map((ticket) => (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        className="support-drawer-ticket"
                        onClick={() => setActiveTicketId(ticket.id)}
                      >
                        <div className="support-drawer-ticket-head">
                          <strong>{ticket.subject}</strong>
                          <StatusPill variant={supportStatusPillVariant(ticket.status)}>
                            {SUPPORT_STATUS_LABELS[ticket.status] ?? ticket.status}
                          </StatusPill>
                        </div>
                        <span className="support-drawer-ticket-meta">
                          {SUPPORT_CATEGORY_LABELS[ticket.category] ?? ticket.category} ·{" "}
                          {new Date(ticket.updatedAt).toLocaleString("ru-RU")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div ref={ticketsQuery.sentinelRef} aria-hidden="true" />
                {ticketsQuery.isLoadingMore ? <p className="page-subtitle">Загружаем ещё…</p> : null}
                {!ticketsQuery.hasMore && tickets.length > 0 ? (
                  <p className="page-subtitle">Это все обращения.</p>
                ) : null}
              </div>
            ) : (
              <form className="support-drawer-body support-drawer-form" onSubmit={onSubmit}>
                <label className="form-field">
                  <span>Категория</span>
                  <select className="select" name="category" defaultValue="technical">
                    {supportTicketCategories.map((category) => (
                      <option key={category} value={category}>
                        {SUPPORT_CATEGORY_LABELS[category] ?? category}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Тема</span>
                  <input className="input" name="subject" placeholder="Коротко опишите вопрос" required minLength={3} />
                </label>
                <label className="form-field">
                  <span>Сообщение</span>
                  <textarea
                    className="textarea"
                    name="text"
                    placeholder="Что произошло, что вы ожидали увидеть, шаги воспроизведения"
                    required
                    minLength={5}
                    rows={6}
                  />
                </label>
                <button className="button" type="submit" disabled={submitting}>
                  <SendActionIcon size={18} />
                  {submitting ? "Отправляю…" : "Отправить обращение"}
                </button>
                {message ? <p className="support-drawer-flash">{message}</p> : null}
              </form>
            )}
          </>
        )}
      </aside>
    </div>
  );
}

function TicketThread({ ticket, onReplied }: { ticket: Ticket; onReplied: () => void }) {
  const { token } = useAuth();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !reply.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/support/tickets/${ticket.id}/replies`, {
        method: "POST",
        token,
        body: { text: reply.trim() },
      });
      setReply("");
      onReplied();
    } catch {
      // оставляем текст в поле — пользователь сможет повторить
    } finally {
      setSending(false);
    }
  }

  const messages = ticket.messages ?? [];

  return (
    <div className="support-drawer-thread">
      <header className="support-drawer-thread-head">
        <strong>{ticket.subject}</strong>
        <span className="page-subtitle">
          {SUPPORT_CATEGORY_LABELS[ticket.category] ?? ticket.category} ·{" "}
          <StatusPill variant={supportStatusPillVariant(ticket.status)}>
            {SUPPORT_STATUS_LABELS[ticket.status] ?? ticket.status}
          </StatusPill>
        </span>
      </header>
      <div className="support-drawer-messages">
        {messages.length === 0 ? <p className="page-subtitle">Пока нет сообщений.</p> : null}
        {messages.map((m) => (
          <div key={m.id} className={`support-drawer-message${m.authorRole === "admin" ? " from-admin" : ""}`}>
            <p>{m.text}</p>
            <small>{new Date(m.createdAt).toLocaleString("ru-RU")}</small>
          </div>
        ))}
      </div>
      <form className="support-drawer-reply" onSubmit={send}>
        <textarea
          className="textarea"
          placeholder="Ваш ответ…"
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          rows={3}
        />
        <button className="button" type="submit" disabled={sending || !reply.trim()}>
          <SendActionIcon size={18} />
          {sending ? "Отправляю…" : "Ответить"}
        </button>
      </form>
    </div>
  );
}
