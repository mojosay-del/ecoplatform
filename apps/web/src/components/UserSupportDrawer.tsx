"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ChevronLeft, MessageSquare, Plus, X } from "lucide-react";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

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

const CATEGORY_LABELS: Record<string, string> = {
  billing: "Биллинг",
  moderation_review: "Модерация",
  company_management: "Компания",
  technical: "Технический вопрос",
  data_deletion: "Удаление данных",
  other: "Другое",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Открыт",
  in_progress: "В работе",
  awaiting_user: "Ждёт ответа",
  resolved: "Решён",
  closed: "Закрыт",
};

type DrawerProps = {
  open: boolean;
  onClose: () => void;
};

export function UserSupportDrawer({ open, onClose }: DrawerProps) {
  const { token } = useAuth();
  const [tab, setTab] = useState<"list" | "new">("list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<Ticket[]>("/support/tickets", { token });
      setTickets(data);
    } catch (error) {
      // Тихо игнорируем — пользователь может быть платформенным стаффом
      // без companyId (API в этом случае вернёт 403). Drawer всё равно
      // открыт, просто список будет пустой.
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Подгружаем список при открытии drawer'а и подписываемся на
  // глобальное событие — если где-то ещё в приложении создадут тикет,
  // список обновится.
  useEffect(() => {
    if (!open) return;
    void loadTickets();
    const handler = () => void loadTickets();
    window.addEventListener("support:changed", handler);
    return () => window.removeEventListener("support:changed", handler);
  }, [open, loadTickets]);

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
    const form = new FormData(event.currentTarget);
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
      event.currentTarget.reset();
      setMessage("Обращение создано. Мы ответим в ближайшее время.");
      // Переключаемся на список, чтобы пользователь увидел свежий тикет.
      await loadTickets();
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
          <button
            type="button"
            className="support-drawer-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </header>

        {activeTicket ? (
          <TicketThread
            ticket={activeTicket}
            onReplied={() => {
              void loadTickets();
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
                {loading ? <p className="page-subtitle">Загружаем…</p> : null}
                {!loading && tickets.length === 0 ? (
                  <div className="support-drawer-empty">
                    <p>У вас пока нет обращений в поддержку.</p>
                    <button
                      type="button"
                      className="button"
                      onClick={() => setTab("new")}
                    >
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
                          <span className={`status-pill status-${ticket.status}`}>
                            {STATUS_LABELS[ticket.status] ?? ticket.status}
                          </span>
                        </div>
                        <span className="support-drawer-ticket-meta">
                          {CATEGORY_LABELS[ticket.category] ?? ticket.category} ·{" "}
                          {new Date(ticket.updatedAt).toLocaleString("ru-RU")}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <form className="support-drawer-body support-drawer-form" onSubmit={onSubmit}>
                <label className="form-field">
                  <span>Категория</span>
                  <select className="select" name="category" defaultValue="technical">
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>Тема</span>
                  <input
                    className="input"
                    name="subject"
                    placeholder="Коротко опишите вопрос"
                    required
                    minLength={3}
                  />
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
          {CATEGORY_LABELS[ticket.category] ?? ticket.category} ·{" "}
          <span className={`status-pill status-${ticket.status}`}>
            {STATUS_LABELS[ticket.status] ?? ticket.status}
          </span>
        </span>
      </header>
      <div className="support-drawer-messages">
        {messages.length === 0 ? (
          <p className="page-subtitle">Пока нет сообщений.</p>
        ) : null}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`support-drawer-message${m.authorRole === "admin" ? " from-admin" : ""}`}
          >
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
          {sending ? "Отправляю…" : "Ответить"}
        </button>
      </form>
    </div>
  );
}
