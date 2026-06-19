"use client";

import { FormEvent, useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { companyStatuses, subscriptionPlans, type PaginatedResponse } from "@ecoplatform/shared";
import { AdminSortButton } from "../../../components/AdminSortButton";
import { AppShell } from "../../../components/AppShell";
import {
  StatusPill,
  companyStatusPillVariant,
  subscriptionStatusPillVariant,
  supportStatusPillVariant,
  userStatusPillVariant,
} from "../../../components/StatusPill";
import { sortItems, type SortState } from "../../../components/admin-table-utils";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import {
  COMPANY_STATUS_LABELS,
  MODERATION_REASON_LABELS,
  SUBSCRIPTION_PLAN_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  USER_STATUS_LABELS,
} from "../../../lib/display-labels";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";
import "../../content-blocks/checklist.css";

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

type AdminCompanyList = PaginatedResponse<AdminCompanyListItem>;
type CompanySortKey = "name" | "status" | "plan" | "users" | "tickets" | "subscriptions" | "createdAt";

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

const statusReasons = [
  "policy_violation",
  "billing_issue",
  "support_request",
  "manual_activation",
  "manual_archive",
  "other",
] as const;

const companySortSelectors: Record<CompanySortKey, (item: AdminCompanyListItem) => string | number> = {
  name: (item) => item.organizationName,
  status: (item) => COMPANY_STATUS_LABELS[item.status] ?? item.status,
  plan: (item) =>
    item.subscriptionPlan ? (SUBSCRIPTION_PLAN_LABELS[item.subscriptionPlan] ?? item.subscriptionPlan) : "",
  users: (item) => item._count.users,
  tickets: (item) => item._count.supportTickets,
  subscriptions: (item) => item._count.subscriptions,
  createdAt: (item) => Date.parse(item.createdAt),
};

export function AdminCompaniesView() {
  const { token } = useAuth();
  const [selected, setSelected] = useState<AdminCompanyDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [planFilter, setPlanFilter] = useState<string>("");
  const [filters, setFilters] = useState({ search: "", status: "", plan: "" });
  const [sort, setSort] = useState<SortState<CompanySortKey>>({ key: "createdAt", direction: "desc" });
  const take = 20;
  const companiesQuery = useInfiniteApiQuery<AdminCompanyListItem>(
    token ? `admin-companies:${filters.search}:${filters.status}:${filters.plan}` : null,
    take,
    async ({ limit, offset }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      if (filters.plan) params.set("plan", filters.plan);
      return apiFetch<AdminCompanyList>(`/admin/companies?${params.toString()}`, { token });
    },
  );

  const [nextStatus, setNextStatus] = useState<string>("active");
  const [statusReason, setStatusReason] = useState<string>("manual_activation");
  const [statusComment, setStatusComment] = useState("");
  const sortedCompanies = useMemo(
    () => sortItems(companiesQuery.items, sort, companySortSelectors),
    [companiesQuery.items, sort],
  );
  const hasActiveFilters = Boolean(filters.search || filters.status || filters.plan);

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setPlanFilter("");
    setFilters({ search: "", status: "", plan: "" });
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
      companiesQuery.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось сменить статус");
    }
  }

  if (!token || companiesQuery.state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Компании</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (companiesQuery.state === "forbidden") {
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

        <form
          className="admin-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters({ search: search.trim(), status: statusFilter, plan: planFilter });
          }}
        >
          <label className="admin-filter-field">
            <Search aria-hidden size={16} />
            <input
              aria-label="Поиск компаний"
              className="input"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по названию или ИНН"
              type="search"
              value={search}
            />
          </label>
          <select className="select" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
            <option value="">Все статусы</option>
            {companyStatuses.map((status) => (
              <option key={status} value={status}>
                {COMPANY_STATUS_LABELS[status] ?? status}
              </option>
            ))}
          </select>
          <select className="select" onChange={(event) => setPlanFilter(event.target.value)} value={planFilter}>
            <option value="">Все тарифы</option>
            {subscriptionPlans.map((plan) => (
              <option key={plan} value={plan}>
                {SUBSCRIPTION_PLAN_LABELS[plan] ?? plan}
              </option>
            ))}
          </select>
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

        {errorMessage || companiesQuery.errorMessage ? (
          <StatusPill as="p" variant="danger">
            {errorMessage ?? companiesQuery.errorMessage}
          </StatusPill>
        ) : null}
        {companiesQuery.isInitialLoading ? <p className="page-subtitle">Загрузка…</p> : null}

        {companiesQuery.state === "ready" || companiesQuery.items.length > 0 ? (
          <div className="moderation-layout admin-master-detail">
            <div className="admin-table-shell">
              <div className="admin-table-meta">
                <p className="page-subtitle">
                  Загружено {companiesQuery.items.length} из {companiesQuery.total}.
                </p>
              </div>
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">
                        <AdminSortButton label="Компания" sort={sort} sortKey="name" onSort={setSort} />
                      </th>
                      <th scope="col">
                        <AdminSortButton label="Статус" sort={sort} sortKey="status" onSort={setSort} />
                      </th>
                      <th scope="col">
                        <AdminSortButton label="Тариф" sort={sort} sortKey="plan" onSort={setSort} />
                      </th>
                      <th scope="col">
                        <AdminSortButton label="Польз." sort={sort} sortKey="users" onSort={setSort} />
                      </th>
                      <th scope="col">
                        <AdminSortButton label="Тикеты" sort={sort} sortKey="tickets" onSort={setSort} />
                      </th>
                      <th scope="col">
                        <AdminSortButton label="Подписки" sort={sort} sortKey="subscriptions" onSort={setSort} />
                      </th>
                      <th scope="col">
                        <AdminSortButton
                          defaultDirection="desc"
                          label="Создана"
                          sort={sort}
                          sortKey="createdAt"
                          onSort={setSort}
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCompanies.map((item) => (
                      <tr className={selected?.id === item.id ? "active" : ""} key={item.id}>
                        <td>
                          <div className="admin-table-cell-main">
                            <button className="admin-row-button" onClick={() => openCompany(item.id)} type="button">
                              {item.organizationName}
                            </button>
                            <span className="admin-table-muted">Детали справа</span>
                          </div>
                        </td>
                        <td>
                          <StatusPill variant={companyStatusPillVariant(item.status)}>
                            {COMPANY_STATUS_LABELS[item.status] ?? item.status}
                          </StatusPill>
                        </td>
                        <td>
                          {item.subscriptionPlan
                            ? (SUBSCRIPTION_PLAN_LABELS[item.subscriptionPlan] ?? item.subscriptionPlan)
                            : "Без тарифа"}
                        </td>
                        <td>{item._count.users}</td>
                        <td>{item._count.supportTickets}</td>
                        <td>{item._count.subscriptions}</td>
                        <td>{new Date(item.createdAt).toLocaleDateString("ru-RU")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {sortedCompanies.length === 0 && !companiesQuery.isInitialLoading ? (
                <div className="admin-empty-state">
                  <p>{hasActiveFilters ? "По текущим фильтрам компаний нет." : "Компаний пока нет."}</p>
                  {hasActiveFilters ? (
                    <button className="button secondary" onClick={resetFilters} type="button">
                      Очистить фильтры
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div ref={companiesQuery.sentinelRef} aria-hidden="true" />
              {companiesQuery.isLoadingMore ? <p className="page-subtitle">Загружаем ещё…</p> : null}
              {!companiesQuery.hasMore && companiesQuery.items.length > 0 ? (
                <p className="page-subtitle">Это все компании.</p>
              ) : null}
            </div>

            <div className="moderation-detail">
              {!selected ? (
                <p className="page-subtitle">Выберите компанию.</p>
              ) : (
                <>
                  <div className="list-row">
                    <div>
                      <StatusPill as="p" variant={companyStatusPillVariant(selected.status)}>
                        {COMPANY_STATUS_LABELS[selected.status] ?? selected.status}
                      </StatusPill>
                      <h2>{selected.organizationName}</h2>
                      <p className="page-subtitle">
                        {selected.subscriptionPlan
                          ? (SUBSCRIPTION_PLAN_LABELS[selected.subscriptionPlan] ?? selected.subscriptionPlan)
                          : "Без активного тарифа"}
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
                            {user.email} ·{" "}
                            <StatusPill variant={userStatusPillVariant(user.status)}>
                              {USER_STATUS_LABELS[user.status] ?? user.status}
                            </StatusPill>
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
                              {SUBSCRIPTION_PLAN_LABELS[subscription.plan] ?? subscription.plan} ·{" "}
                              <StatusPill variant={subscriptionStatusPillVariant(subscription.status)}>
                                {SUBSCRIPTION_STATUS_LABELS[subscription.status] ?? subscription.status}
                              </StatusPill>
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
                              {SUPPORT_CATEGORY_LABELS[ticket.category] ?? ticket.category} ·{" "}
                              <StatusPill variant={supportStatusPillVariant(ticket.status)}>
                                {SUPPORT_STATUS_LABELS[ticket.status] ?? ticket.status}
                              </StatusPill>
                            </p>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>

                  <form className="form" onSubmit={submitStatus}>
                    <h3>Сменить статус</h3>
                    <select
                      className="select"
                      onChange={(event) => setNextStatus(event.target.value)}
                      value={nextStatus}
                    >
                      {companyStatuses.map((status) => (
                        <option key={status} value={status}>
                          {COMPANY_STATUS_LABELS[status] ?? status}
                        </option>
                      ))}
                    </select>
                    <select
                      className="select"
                      onChange={(event) => setStatusReason(event.target.value)}
                      value={statusReason}
                    >
                      {statusReasons.map((value) => (
                        <option key={value} value={value}>
                          {MODERATION_REASON_LABELS[value] ?? value}
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
