"use client";

import { FormEvent, useRef, useState, type SetStateAction } from "react";
import { subscriptionPlans } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { StatusPill, companyStatusPillVariant, subscriptionStatusPillVariant } from "../../../components/StatusPill";
import { apiFetch } from "../../../lib/api";
import { queryKeys } from "../../../lib/query/keys";
import {
  COMPANY_STATUS_LABELS,
  SUBSCRIPTION_PLAN_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from "../../../lib/display-labels";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";
import "../../content-blocks/checklist.css";

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
      setErrorMessage(error instanceof Error ? error.message : "Не удалось активировать подписку");
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }

  if (companiesQuery.state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Ручная активация подписки</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (companiesQuery.state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Ручная активация подписки</h1>
          <p className="page-subtitle">Раздел доступен только администратору.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Ручная активация подписки</h1>
          <p className="page-subtitle">
            Используется, пока нет автоматического платёжного шлюза. Действие фиксируется в журнале админов.
          </p>
        </header>
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

        <form className="form" onSubmit={submit}>
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

        <section className="stack-list" style={{ marginTop: 24 }}>
          <h2>Компании на платформе</h2>
          {companies.length === 0 ? <p className="page-subtitle">Компаний пока нет.</p> : null}
          {companies.map((company) => (
            <article className="checklist-block" key={company.id}>
              <strong>{company.organizationName}</strong>
              <p>
                <StatusPill variant={companyStatusPillVariant(company.status)}>
                  {COMPANY_STATUS_LABELS[company.status] ?? company.status}
                </StatusPill>{" "}
                · Тариф:{" "}
                {company.subscriptionPlan
                  ? (SUBSCRIPTION_PLAN_LABELS[company.subscriptionPlan] ?? company.subscriptionPlan)
                  : "—"}
                {company.subscriptionEndsAt
                  ? ` (до ${new Date(company.subscriptionEndsAt).toLocaleDateString("ru-RU")})`
                  : ""}
              </p>
              {company.subscriptions[0] ? (
                <p className="page-subtitle">
                  Последняя подписка:{" "}
                  {SUBSCRIPTION_PLAN_LABELS[company.subscriptions[0].plan] ?? company.subscriptions[0].plan} ·{" "}
                  <StatusPill variant={subscriptionStatusPillVariant(company.subscriptions[0].status)}>
                    {SUBSCRIPTION_STATUS_LABELS[company.subscriptions[0].status] ?? company.subscriptions[0].status}
                  </StatusPill>{" "}
                  · до {new Date(company.subscriptions[0].endsAt).toLocaleDateString("ru-RU")}
                </p>
              ) : null}
            </article>
          ))}
          <div ref={companiesQuery.sentinelRef} aria-hidden="true" />
          {companiesQuery.isLoadingMore ? <p className="page-subtitle">Загружаем ещё…</p> : null}
          {!companiesQuery.hasMore && companies.length > 0 ? <p className="page-subtitle">Это все компании.</p> : null}
        </section>
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
