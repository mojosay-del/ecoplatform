"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronLeft, MessageSquare, Plus, X } from "lucide-react";
import { supportTicketCategories } from "@ecoplatform/shared";
import "./support-drawer.css";
import { SendActionIcon } from "./app-shell/nav-icons";
import { StatusPill, supportStatusPillVariant } from "./StatusPill";
import { errorText, api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { SUPPORT_CATEGORY_LABELS, SUPPORT_STATUS_LABELS } from "../lib/display-labels";
import { formatDateTime } from "../lib/formatters";
import { useDialogA11y } from "../lib/use-dialog-a11y";
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
  messages?: Message[];
};

type DrawerProps = {
  open: boolean;
  onClose: () => void;
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

function SupportDrawerAvatar({
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

export function UserSupportDrawer({ open, onClose }: DrawerProps) {
  const { token } = useAuth();
  const drawerRef = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<"list" | "new">("list");
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const ticketsQuery = useInfiniteApiQuery<Ticket>(
    open && token ? "support-drawer-tickets" : null,
    30,
    ({ limit, offset }) =>
      api.support.listMyTickets({ limit, offset }) as Promise<{ items: Ticket[]; total: number; hasMore: boolean }>,
  );
  const tickets = ticketsQuery.items;
  const reloadTickets = ticketsQuery.reload;

  useDialogA11y(drawerRef, { bodyLock: true, enabled: open, onEscape: onClose, restoreFocus: true });

  // Подгружаем список при открытии drawer'а и подписываемся на
  // глобальное событие — если где-то ещё в приложении создадут тикет,
  // список обновится.
  useEffect(() => {
    if (!open) return;
    const handler = () => reloadTickets();
    window.addEventListener("support:changed", handler);
    return () => window.removeEventListener("support:changed", handler);
  }, [open, reloadTickets]);

  const createTicket = useMutation({
    mutationFn: (input: { category: string; subject: string; text: string }) => api.support.createTicket(input),
    onSuccess: () => {
      setMessage("Обращение создано. Мы ответим в ближайшее время.");
      // Переключаемся на список, чтобы пользователь увидел свежий тикет.
      ticketsQuery.reload();
      setTab("list");
      // Кросс-компонентный мост: кабинет тоже показывает обращения.
      window.dispatchEvent(new Event("support:changed"));
    },
    onError: (error) => {
      setMessage(errorText(error, "Не удалось создать обращение."));
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage(null);
    createTicket.mutate(
      {
        category: String(form.get("category")),
        subject: String(form.get("subject")),
        text: String(form.get("text")),
      },
      { onSuccess: () => formElement.reset() },
    );
  }

  if (!open) return null;

  const activeTicket = tickets.find((t) => t.id === activeTicketId) ?? null;

  return (
    <div className="support-drawer-root" role="dialog" aria-modal="true" aria-labelledby="support-drawer-title">
      <div className="support-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="support-drawer" ref={drawerRef}>
        <header className="support-drawer-head">
          <h2 className="support-drawer-title" id="support-drawer-title">
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
            key={activeTicket.id}
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
                          <time dateTime={ticket.updatedAt}>{formatDateTime(ticket.updatedAt)}</time>
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
                <button className="button" type="submit" disabled={createTicket.isPending}>
                  <SendActionIcon size={18} />
                  {createTicket.isPending ? "Отправляю…" : "Отправить обращение"}
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
  const { token, user } = useAuth();
  const messagesRef = useRef<HTMLDivElement>(null);
  const [reply, setReply] = useState("");

  const sendReply = useMutation({
    mutationFn: (text: string) => api.support.replyToTicket(ticket.id, { text }),
    onSuccess: () => {
      setReply("");
      onReplied();
    },
    // оставляем текст в поле при ошибке — пользователь сможет повторить
  });

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !reply.trim()) return;
    sendReply.mutate(reply.trim());
  }

  const messages = ticket.messages ?? [];
  const currentUserAuthor: SupportMessageAuthor | null = user
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
  }, [messages.length, ticket.id]);

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
      <div className="support-drawer-chat-surface">
        <div
          aria-label="История переписки"
          aria-live="polite"
          aria-relevant="additions text"
          className="support-drawer-messages"
          ref={messagesRef}
          role="log"
          tabIndex={messages.length > 0 ? 0 : undefined}
        >
          {messages.length === 0 ? <p className="support-drawer-thread-empty">Пока нет сообщений.</p> : null}
          {messages.map((m) => {
            const isSupportReply = m.authorRole === "admin";
            const authorLabel = isSupportReply ? "Поддержка" : "Вы";
            const messageAuthor = m.author ?? (isSupportReply ? null : currentUserAuthor);

            return (
              <article key={m.id} className={`support-drawer-message${isSupportReply ? " from-admin" : " from-user"}`}>
                <SupportDrawerAvatar
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
        <form className="support-drawer-reply" onSubmit={send}>
          <SupportDrawerAvatar
            author={currentUserAuthor}
            className="support-drawer-composer-avatar"
            fallbackLabel="Вы"
          />
          <div className="support-drawer-composer-body">
            <label className="support-drawer-sr-only" htmlFor={`support-reply-${ticket.id}`}>
              Ваш ответ
            </label>
            <textarea
              className="support-drawer-textarea"
              id={`support-reply-${ticket.id}`}
              placeholder="Сообщение"
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              rows={2}
            />
            <button
              aria-label={sendReply.isPending ? "Отправляем ответ" : "Ответить"}
              className="button support-drawer-submit"
              disabled={sendReply.isPending || !reply.trim()}
              title={sendReply.isPending ? "Отправляем ответ" : "Ответить"}
              type="submit"
            >
              <SendActionIcon size={22} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
