"use client";

import { FormEvent, useMemo, useRef, useState, type SetStateAction } from "react";
import { CreditCard } from "lucide-react";
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
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";

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
  const companiesQuery = useInfiniteApiQuery<CompanyItem>(
    queryKeys.admin.billingCompanies(""),
    50,
    async ({ limit, offset }) => {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      return apiFetch<{ items: CompanyItem[]; total: number; hasMore: boolean }>(`/admin/billing/companies?${query}`);
    },
  );
  const companies = companiesQuery.items;

  // Сводка по загруженному списку компаний (быстрый взгляд «сколько активно /
  // скоро истекает»). Считается по подтянутым записям.
  const summary = useMemo(() => {
    const now = Date.now();
    const soon = now + 7 * 24 * 60 * 60 * 1000;
    let active = 0;
    let expiring = 0;
    for (const company of companies) {
      if (!company.subscriptionPlan || !company.subscriptionEndsAt) continue;
      const ends = new Date(company.subscriptionEndsAt).getTime();
      if (ends <= now) continue;
      active += 1;
      if (ends <= soon) expiring += 1;
    }
    return { active, expiring };
  }, [companies]);

  const [form, setForm] = useState({
    companyId: "",
    plan: "basic" as "basic" | "extended",
    endsAt: defaultEndsAt(),
    reason: "",
  });
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
      // Список — react-query: инвалидируем, чтобы подтянуть новый статус.
      companiesQuery.reload();
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
                onChange={(event) => updateForm((prev) => ({ ...prev, companyId: event.target.value }))}
                required
              >
                <option value="">Выберите компанию…</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.organizationName} · {COMPANY_STATUS_LABELS[company.status] ?? company.status}
                  </option>
                ))}
              </select>
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
            {companies.length > 0 ? (
              <div className="admin-billing-summary">
                <div className="admin-billing-summary-chip">
                  <span className="admin-billing-summary-value">{summary.active}</span>
                  <span className="admin-billing-summary-label">Активных подписок</span>
                </div>
                <div className="admin-billing-summary-chip admin-billing-summary-chip-warning">
                  <span className="admin-billing-summary-value">{summary.expiring}</span>
                  <span className="admin-billing-summary-label">Истекают ≤ 7 дней</span>
                </div>
              </div>
            ) : null}

            <div className="admin-table-shell">
              <div className="admin-table-meta">
                <p className="page-subtitle">Компании на платформе</p>
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
                  description="Здесь появятся компании после регистрации на платформе."
                  icon={CreditCard}
                  title="Компаний пока нет"
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
