"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

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
  { value: "basic", label: "basic" },
  { value: "extended", label: "extended" },
] as const;

export function AdminBillingView() {
  const { token } = useAuth();
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [form, setForm] = useState({
    companyId: "",
    plan: "basic" as "basic" | "extended",
    endsAt: defaultEndsAt(),
    reason: "",
  });
  const [submitting, setSubmitting] = useState(false);

  async function loadCompanies() {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setErrorMessage(null);
    try {
      const page = await apiFetch<{ items: CompanyItem[]; total: number; hasMore: boolean }>(
        "/admin/billing/companies",
        { token },
      );
      setCompanies(page.items);
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await apiFetch("/admin/billing/manual-subscriptions", {
        method: "POST",
        token,
        body: {
          companyId: form.companyId,
          plan: form.plan,
          endsAt: new Date(form.endsAt).toISOString(),
          reason: form.reason.trim(),
        },
      });
      setSuccessMessage("Подписка активирована.");
      setForm((prev) => ({ ...prev, reason: "" }));
      await loadCompanies();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось активировать подписку");
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    void loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Ручная активация подписки</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
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
        {successMessage ? <p className="status-pill">{successMessage}</p> : null}
        {errorMessage ? <p className="status-pill">{errorMessage}</p> : null}
        {state === "loading" ? <p className="page-subtitle">Загрузка…</p> : null}

        <form className="form" onSubmit={submit}>
          <label className="form-field">
            <span>Компания</span>
            <select
              className="select"
              value={form.companyId}
              onChange={(event) => setForm((prev) => ({ ...prev, companyId: event.target.value }))}
              required
            >
              <option value="">Выберите компанию…</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.organizationName} · {company.status}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Тариф</span>
            <select
              className="select"
              value={form.plan}
              onChange={(event) => setForm((prev) => ({ ...prev, plan: event.target.value as "basic" | "extended" }))}
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
              onChange={(event) => setForm((prev) => ({ ...prev, endsAt: event.target.value }))}
              required
            />
          </label>

          <label className="form-field">
            <span>Причина / комментарий</span>
            <textarea
              className="textarea small"
              placeholder="Например: оплачено по счёту № 123 от 2026-05-19."
              value={form.reason}
              onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
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
                <span className="status-pill">{company.status}</span> · Тариф: {company.subscriptionPlan ?? "—"}
                {company.subscriptionEndsAt
                  ? ` (до ${new Date(company.subscriptionEndsAt).toLocaleDateString("ru-RU")})`
                  : ""}
              </p>
              {company.subscriptions[0] ? (
                <p className="page-subtitle">
                  Последняя подписка: {company.subscriptions[0].plan} · {company.subscriptions[0].status} · до{" "}
                  {new Date(company.subscriptions[0].endsAt).toLocaleDateString("ru-RU")}
                </p>
              ) : null}
            </article>
          ))}
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
