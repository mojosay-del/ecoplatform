"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

export function AdminSupportView() {
  const { token } = useAuth();
  const [tickets, setTickets] = useState<any[]>([]);
  const [result, setResult] = useState("");

  useEffect(() => {
    void loadTickets();
  }, [token]);

  async function loadTickets() {
    if (!token) {
      return;
    }

    try {
      setTickets(await apiFetch<any[]>("/admin/support/tickets", { token }));
    } catch {
      setTickets([]);
    }
  }

  async function onReply(event: FormEvent<HTMLFormElement>, ticketId: string) {
    event.preventDefault();

    if (!token) {
      setResult("Сначала войдите как администратор.");
      return;
    }

    const form = new FormData(event.currentTarget);

    try {
      await apiFetch(`/admin/support/tickets/${ticketId}/replies`, {
        method: "POST",
        token,
        body: { text: String(form.get("text")) },
      });
      event.currentTarget.reset();
      setResult("Ответ отправлен.");
      await loadTickets();
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Не удалось отправить ответ.");
    }
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Админ / Поддержка</h1>
          <p className="page-subtitle">Очередь обращений компаний и быстрый ответ администратора.</p>
        </header>
        {result ? <p className="status-pill">{result}</p> : null}
        <div className="stack-list">
          {tickets.length === 0 ? <article className="card">Обращений пока нет или API недоступен.</article> : null}
          {tickets.map((ticket) => (
            <article className="card support-ticket" key={ticket.id}>
              <div className="list-row">
                <div>
                  <h2>{ticket.subject}</h2>
                  <p className="page-subtitle">{ticket.company?.organizationName} · {ticket.author?.email}</p>
                </div>
                <span className="status-pill">{ticket.status}</span>
              </div>
              <div className="message-list">
                {ticket.messages?.map((message: any) => (
                  <p key={message.id}>
                    <strong>{message.authorRole}:</strong> {message.text}
                  </p>
                ))}
              </div>
              <form className="reply-form" onSubmit={(event) => onReply(event, ticket.id)}>
                <input className="input" name="text" placeholder="Ответить" />
                <button className="button secondary" type="submit">Ответить</button>
              </form>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
