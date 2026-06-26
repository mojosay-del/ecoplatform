"use client";

import { FormEvent, useRef, useState, type SetStateAction } from "react";
import { CreditCard, RotateCcw, Search } from "lucide-react";
import { subscriptionPlans } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { StatusPill, companyStatusPillVariant, subscriptionStatusPillVariant } from "../../../components/StatusPill";
import { AdminEmptyState, AdminInfiniteFooter, AdminPageHeader } from "../../../components/admin";
import { errorText, apiFetch } from "../../../lib/api";
import { queryKeys } from "../../../lib/query/keys";
import {
  COMPANY_STATUS_LABELS,
  SUBSCRIPTION_PLAN_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from "../../../lib/display-labels";
import { useApiQuery } from "../../shared";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";

type BillingSummary = { activeSubscriptions: number; expiringSoon: number };

type CompanyItem = {
  id: string;
  organizationName: string;
  status: string;
  subscriptionPlan: string | null;
  subscriptionEndsAt: string | null;
  demoEndsAt: string | null;
  subscriptions: Array<{
    id: string;
    plan: string;
    status: string;
    startsAt: string;
    endsAt: string;
    reason: string | null;
  }>;
};

export function AdminBillingView() {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const companiesQuery = useInfiniteApiQuery<CompanyItem>(
    queryKeys.admin.billingCompanies(appliedSearch),
    50,
    async ({ limit, offset }) => {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (appliedSearch) query.set("search", appliedSearch);
      return apiFetch<{ items: CompanyItem[]; total: number; hasMore: boolean }>(`/admin/billing/companies?${query}`);
    },
  );
  const companies = companiesQuery.items;

  // Точные счётчики по всей БД (не по загруженной странице) — отдельный лёгкий
  // агрегат-эндпоинт, чтобы сводка не врала при пагинации.
  const summaryQuery = useApiQuery<BillingSummary>(
    queryKeys.admin.billingSummary(),
    () => apiFetch<BillingSummary>("/admin/billing/summary"),
    { activeSubscriptions: 0, expiringSoon: 0 },
  );
  const summary = summaryQuery.data;

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(search.trim());
  }

  function resetSearch() {
    setSearch("");
    setAppliedSearch("");
  }

  const [form, setForm] = useState({
    companyId: "",
    plan: "basic" as "basic" | "extended",
    endsAt: defaultEndsAt(),
    reason: "",
  });
  // Сохраняем подпись выбранной компании отдельно: если поиск отфильтрует её из
  // списка, выбор в форме всё равно остаётся видимым.
  const [selectedCompanyLabel, setSelectedCompanyLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const idempotencyKey = useRef(createIdempotencyKey());

  function updateForm(next: SetStateAction<typeof form>) {
    idempotencyKey.current = createIdempotencyKey();
    setForm(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiFetch("/admin/billing/manual-subscriptions", {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey.current },
        body: {
          companyId: form.companyId,
          plan: form.plan,
          endsAt: new Date(form.endsAt).toISOString(),
          reason: form.reason.trim(),
        },
      });
      setSuccessMessage("Подписка активирована.");
      idempotencyKey.current = createIdempotencyKey();
      setForm((prev) => ({ ...prev, reason: "" }));
      // Список и сводку — инвалидируем, чтобы подтянуть новый статус/счётчики.
      companiesQuery.reload();
      void summaryQuery.refetch();
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось активировать подписку"));
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }

  if (companiesQuery.state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Подписки</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (companiesQuery.state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Подписки</h1>
          <p className="page-subtitle">Раздел доступен только администратору.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <AdminPageHeader
          count={companiesQuery.state === "ready" || companies.length > 0 ? companiesQuery.total : undefined}
          subtitle="Тарифы компаний и ручная активация подписки. Действие фиксируется в журнале админов."
          title="Подписки"
        />

        {successMessage ? (
          <StatusPill as="p" variant="success">
            {successMessage}
          </StatusPill>
        ) : null}
        {errorMessage || companiesQuery.errorMessage ? (
          <StatusPill as="p" variant="danger">
            {errorMessage ?? companiesQuery.errorMessage}
          </StatusPill>
        ) : null}
        {companiesQuery.isInitialLoading ? <p className="page-subtitle">Загрузка…</p> : null}

        <form className="admin-filter-bar" onSubmit={submitSearch} role="search">
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
          <div className="admin-filter-actions">
            <button className="button" type="submit">
              Найти
            </button>
            {appliedSearch ? (
              <button className="button secondary" onClick={resetSearch} type="button">
                <RotateCcw aria-hidden size={16} />
                Сбросить
              </button>
            ) : null}
          </div>
        </form>

        <div className="admin-billing-layout">
          <form className="admin-billing-form" onSubmit={submit}>
            <header className="admin-billing-form-head">
              <span className="admin-billing-form-icon" aria-hidden>
                <CreditCard size={18} />
              </span>
              <div>
                <strong>Ручная активация</strong>
                <p>Пока нет автоматического платёжного шлюза.</p>
              </div>
            </header>

            <label className="form-field">
              <span>Компания</span>
              <select
                className="select"
                value={form.companyId}
                onChange={(event) => {
                  const id = event.target.value;
                  const picked = companies.find((company) => company.id === id);
                  setSelectedCompanyLabel(picked ? picked.organizationName : "");
                  updateForm((prev) => ({ ...prev, companyId: id }));
                }}
                required
              >
                <option value="">Выберите компанию…</option>
                {/* Если выбранная компания отфильтрована поиском — показываем её
                    отдельной опцией, чтобы выбор не «слетал». */}
                {form.companyId && !companies.some((company) => company.id === form.companyId) ? (
                  <option value={form.companyId}>{selectedCompanyLabel || "Выбранная компания"}</option>
                ) : null}
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.organizationName} · {COMPANY_STATUS_LABELS[company.status] ?? company.status}
                  </option>
                ))}
              </select>
              <small className="form-field-hint">Не нашли компанию? Сузьте список поиском выше.</small>
            </label>

            <label className="form-field">
              <span>Тариф</span>
              <select
                className="select"
                value={form.plan}
                onChange={(event) =>
                  updateForm((prev) => ({ ...prev, plan: event.target.value as "basic" | "extended" }))
                }
              >
                {subscriptionPlans.map((plan) => (
                  <option key={plan} value={plan}>
                    {SUBSCRIPTION_PLAN_LABELS[plan]}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Дата окончания</span>
              <input
                className="input"
                type="date"
                value={form.endsAt}
                onChange={(event) => updateForm((prev) => ({ ...prev, endsAt: event.target.value }))}
                required
              />
            </label>

            <label className="form-field">
              <span>Причина / комментарий</span>
              <textarea
                className="textarea small"
                placeholder="Например: оплачено по счёту № 123 от 2026-05-19."
                value={form.reason}
                onChange={(event) => updateForm((prev) => ({ ...prev, reason: event.target.value }))}
                minLength={3}
                required
              />
            </label>

            <button className="button" type="submit" disabled={submitting || !form.companyId}>
              {submitting ? "Активирую…" : "Активировать подписку"}
            </button>
          </form>

          <div className="admin-billing-companies">
            <div className="admin-billing-summary">
              <div className="admin-billing-summary-chip">
                <span className="admin-billing-summary-value">{summary.activeSubscriptions}</span>
                <span className="admin-billing-summary-label">Активных подписок</span>
              </div>
              <div className="admin-billing-summary-chip admin-billing-summary-chip-warning">
                <span className="admin-billing-summary-value">{summary.expiringSoon}</span>
                <span className="admin-billing-summary-label">Истекают ≤ 7 дней</span>
              </div>
            </div>

            <div className="admin-table-shell">
              <div className="admin-table-meta">
                <p className="page-subtitle">
                  {appliedSearch ? `Результаты поиска · ${companiesQuery.total}` : "Компании на платформе"}
                </p>
              </div>
              <div className="admin-table-scroll">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th scope="col">Компания</th>
                      <th scope="col">Статус</th>
                      <th scope="col">Тариф</th>
                      <th scope="col">Действует до</th>
                      <th scope="col">Последняя подписка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map((company) => {
                      const last = company.subscriptions[0];
                      return (
                        <tr key={company.id}>
                          <td>
                            <div className="admin-table-cell-main">
                              <strong>{company.organizationName}</strong>
                            </div>
                          </td>
                          <td>
                            <StatusPill variant={companyStatusPillVariant(company.status)}>
                              {COMPANY_STATUS_LABELS[company.status] ?? company.status}
                            </StatusPill>
                          </td>
                          <td>
                            {company.subscriptionPlan
                              ? (SUBSCRIPTION_PLAN_LABELS[company.subscriptionPlan] ?? company.subscriptionPlan)
                              : "—"}
                          </td>
                          <td>
                            {company.subscriptionEndsAt
                              ? new Date(company.subscriptionEndsAt).toLocaleDateString("ru-RU")
                              : "—"}
                          </td>
                          <td>
                            {last ? (
                              <div className="admin-table-cell-main">
                                <StatusPill variant={subscriptionStatusPillVariant(last.status)}>
                                  {SUBSCRIPTION_STATUS_LABELS[last.status] ?? last.status}
                                </StatusPill>
                                <span className="admin-table-muted">
                                  {SUBSCRIPTION_PLAN_LABELS[last.plan] ?? last.plan} · до{" "}
                                  {new Date(last.endsAt).toLocaleDateString("ru-RU")}
                                </span>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {companies.length === 0 && !companiesQuery.isInitialLoading ? (
                <AdminEmptyState
                  description={
                    appliedSearch
                      ? "По вашему запросу ничего не нашлось — попробуйте другое название или ИНН."
                      : "Здесь появятся компании после регистрации на платформе."
                  }
                  icon={appliedSearch ? Search : CreditCard}
                  title={appliedSearch ? "Ничего не найдено" : "Компаний пока нет"}
                />
              ) : null}

              <AdminInfiniteFooter
                endLabel="Это все компании."
                hasItems={companies.length > 0}
                hasMore={companiesQuery.hasMore}
                isLoadingMore={companiesQuery.isLoadingMore}
                sentinelRef={companiesQuery.sentinelRef}
              />
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function defaultEndsAt(): string {
  const date = new Date();
  date.setMonth(date.getMonth() + 1);
  return date.toISOString().slice(0, 10);
}

function createIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `manual-subscription-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
