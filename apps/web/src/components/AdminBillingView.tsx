"use client";

import { FormEvent, useEffect, useRef, useState, type SetStateAction } from "react";
import { AppShell } from "./AppShell";
import { CmsTabs } from "./CmsTabs";
import { StatusPill, companyStatusPillVariant, subscriptionStatusPillVariant } from "./StatusPill";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";

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

type ViewState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

const plans = [
  { value: "basic", label: "Базовый" },
  { value: "extended", label: "Расширенный" },
] as const;

const COMPANY_STATUS_LABELS: Record<string, string> = {
  demo: "Демо",
  active: "Активна",
  past_due: "Просрочена",
  suspended: "Приостановлена",
  pending_deletion: "Удаление запланировано",
  blocked: "Заблокирована",
  archived: "В архиве",
};

const SUBSCRIPTION_PLAN_LABELS: Record<string, string> = {
  basic: "Базовый",
  extended: "Расширенный",
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "Активна",
  past_due: "Просрочена",
  cancelled: "Отменена",
  expired: "Истекла",
};

export function AdminBillingView() {
  const { token } = useAuth();
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const companiesQuery = useInfiniteApiQuery<CompanyItem>(
    token ? "admin-billing-companies" : null,
    50,
    async ({ limit, offset }) => {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      return apiFetch<{ items: CompanyItem[]; total: number; hasMore: boolean }>(`/admin/billing/companies?${query}`, {
        token,
      });
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

  function loadCompanies() {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("ready");
    setErrorMessage(null);
    companiesQuery.reload();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || submitInFlight.current) return;
    submitInFlight.current = true;
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiFetch("/admin/billing/manual-subscriptions", {
        method: "POST",
        token,
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
      loadCompanies();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось активировать подписку");
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === "unauthenticated" || companiesQuery.state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Ручная активация подписки</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden" || companiesQuery.state === "forbidden") {
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
        <CmsTabs />
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
        {state === "loading" || companiesQuery.isInitialLoading ? <p className="page-subtitle">Загрузка…</p> : null}

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
              {plans.map((plan) => (
                <option key={plan.value} value={plan.value}>
                  {plan.label}
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
