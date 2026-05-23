"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminPeopleTabs } from "./AdminPeopleTabs";
import { AppShell } from "./AppShell";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

type AdminCompanyListItem = {
  id: string;
  organizationName: string;
  status: string;
  subscriptionPlan: string | null;
  subscriptionEndsAt: string | null;
  demoEndsAt: string | null;
  createdAt: string;
  _count: { users: number; subscriptions: number; supportTickets: number };
};

type AdminCompanyList = {
  total: number;
  page: number;
  take: number;
  items: AdminCompanyListItem[];
};

type AdminCompanyDetail = {
  id: string;
  organizationName: string;
  status: string;
  subscriptionPlan: string | null;
  subscriptionEndsAt: string | null;
  demoEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
  users: Array<{
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    createdAt: string;
  }>;
  subscriptions: Array<{
    id: string;
    plan: string;
    status: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
  }>;
  supportTickets: Array<{
    id: string;
    category: string;
    subject: string;
    status: string;
    createdAt: string;
  }>;
};

const companyStatuses = ["demo", "active", "past_due", "suspended", "blocked", "archived"] as const;
const subscriptionPlans = ["basic", "extended"] as const;
const statusReasons: ReadonlyArray<readonly [string, string]> = [
  ["policy_violation", "Нарушение правил"],
  ["billing_issue", "Биллинг"],
  ["support_request", "По запросу поддержки"],
  ["manual_activation", "Ручная активация"],
  ["manual_archive", "Архивирование"],
  ["other", "Иное"],
];

export function AdminCompaniesView() {
  const { token } = useAuth();
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [list, setList] = useState<AdminCompanyList | null>(null);
  const [selected, setSelected] = useState<AdminCompanyDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [planFilter, setPlanFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const take = 20;

  const [nextStatus, setNextStatus] = useState<string>("active");
  const [statusReason, setStatusReason] = useState<string>("manual_activation");
  const [statusComment, setStatusComment] = useState("");

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
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (planFilter) params.set("plan", planFilter);
      const data = await apiFetch<AdminCompanyList>(`/admin/companies?${params.toString()}`, { token });
      setList(data);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить компании");
    }
  }

  async function openCompany(id: string) {
    if (!token) return;
    try {
      const data = await apiFetch<AdminCompanyDetail>(`/admin/companies/${id}`, { token });
      setSelected(data);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить компанию");
    }
  }

  async function submitStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selected) return;
    try {
      const data = await apiFetch<AdminCompanyDetail>(`/admin/companies/${selected.id}/status`, {
        method: "POST",
        token,
        body: {
          status: nextStatus,
          reasonCode: statusReason,
          comment: statusComment.trim() || undefined,
        },
      });
      setSelected(data);
      setStatusComment("");
      await loadList();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось сменить статус");
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Компании</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Компании</h1>
          <p className="page-subtitle">Раздел доступен только администратору.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Компании</h1>
          <p className="page-subtitle">Управление компаниями и их подписками.</p>
        </header>
        <AdminPeopleTabs />

        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            void loadList({ page: 1 });
          }}
        >
          <div className="auth-actions">
            <input
              className="input"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по названию или ИНН"
              type="search"
              value={search}
            />
            <select className="select" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
              <option value="">Все статусы</option>
              {companyStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select className="select" onChange={(event) => setPlanFilter(event.target.value)} value={planFilter}>
              <option value="">Все тарифы</option>
              {subscriptionPlans.map((plan) => (
                <option key={plan} value={plan}>
                  {plan}
                </option>
              ))}
            </select>
            <button className="button" type="submit">
              Применить
            </button>
          </div>
        </form>

        {errorMessage ? <p className="status-pill">{errorMessage}</p> : null}
        {state === "loading" ? <p className="page-subtitle">Загрузка…</p> : null}

        {list ? (
          <div className="moderation-layout">
            <div className="stack-list">
              <p className="page-subtitle">
                Всего: {list.total}, страница {list.page}.
              </p>
              {list.items.map((item) => (
                <button
                  className={`moderation-case-row ${selected?.id === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => openCompany(item.id)}
                  type="button"
                >
                  <span className="status-pill">{item.status}</span>
                  <strong>{item.organizationName}</strong>
                  <span>
                    {item.subscriptionPlan ?? "без тарифа"} · {item._count.users} польз.
                  </span>
                  <small>
                    Тикетов: {item._count.supportTickets} · Подписок: {item._count.subscriptions}
                  </small>
                </button>
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

            <div className="moderation-detail">
              {!selected ? (
                <p className="page-subtitle">Выберите компанию.</p>
              ) : (
                <>
                  <div className="list-row">
                    <div>
                      <p className="status-pill">{selected.status}</p>
                      <h2>{selected.organizationName}</h2>
                      <p className="page-subtitle">
                        {selected.subscriptionPlan ?? "Без активного тарифа"}
                        {selected.subscriptionEndsAt
                          ? ` · до ${new Date(selected.subscriptionEndsAt).toLocaleDateString("ru-RU")}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <section>
                    <h3>Пользователи ({selected.users.length})</h3>
                    <div className="stack-list">
                      {selected.users.map((user) => (
                        <article className="checklist-block" key={user.id}>
                          <strong>
                            {user.firstName} {user.lastName}
                          </strong>
                          <p>
                            {user.email} · {user.status}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3>Подписки</h3>
                    {selected.subscriptions.length === 0 ? (
                      <p className="page-subtitle">Нет.</p>
                    ) : (
                      <div className="stack-list">
                        {selected.subscriptions.map((subscription) => (
                          <article className="checklist-block" key={subscription.id}>
                            <strong>
                              {subscription.plan} · {subscription.status}
                            </strong>
                            <p>
                              {new Date(subscription.startsAt).toLocaleDateString("ru-RU")} →{" "}
                              {new Date(subscription.endsAt).toLocaleDateString("ru-RU")}
                            </p>
                            {subscription.reason ? <small>{subscription.reason}</small> : null}
                          </article>
                        ))}
                      </div>
                    )}
                  </section>

                  <section>
                    <h3>Последние тикеты</h3>
                    {selected.supportTickets.length === 0 ? (
                      <p className="page-subtitle">Нет.</p>
                    ) : (
                      <div className="stack-list">
                        {selected.supportTickets.map((ticket) => (
                          <article className="checklist-block" key={ticket.id}>
                            <strong>{ticket.subject}</strong>
                            <p>
                              {ticket.category} · {ticket.status}
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>

                  <form className="form" onSubmit={submitStatus}>
                    <h3>Сменить статус</h3>
                    <select className="select" onChange={(event) => setNextStatus(event.target.value)} value={nextStatus}>
                      {companyStatuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <select className="select" onChange={(event) => setStatusReason(event.target.value)} value={statusReason}>
                      {statusReasons.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      className="textarea small"
                      onChange={(event) => setStatusComment(event.target.value)}
                      placeholder="Комментарий (обязателен для «Иное»)"
                      value={statusComment}
                    />
                    <button className="button" type="submit">
                      Сохранить статус
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
