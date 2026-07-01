"use client";

// Ручная активация подписки для выбранной компании. Раньше жила на отдельной
// странице «Подписки»; перенесена в карточку компании (раздел «Компании» —
// единый источник для управления компанией и её тарифом). Бэкенд-эндпоинт
// /admin/billing/manual-subscriptions сохранён без изменений.

import { useRef, useState, type FormEvent } from "react";
import { CreditCard } from "lucide-react";
import { subscriptionPlans } from "@ecoplatform/shared";
import { errorText, api } from "../../../lib/api";
import { SUBSCRIPTION_PLAN_LABELS } from "../../../lib/display-labels";

export function CompanySubscriptionActivationForm({
  companyId,
  onActivated,
}: {
  companyId: string;
  onActivated: () => void;
}) {
  const [plan, setPlan] = useState<"basic" | "extended">("basic");
  const [endsAt, setEndsAt] = useState(defaultEndsAt());
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const inFlight = useRef(false);
  // Идемпотентность: новый ключ на каждый логический запрос (после правки полей и
  // после успешной отправки) — защищает от двойной активации при дабл-клике.
  const idempotencyKey = useRef(createIdempotencyKey());

  function resetKey() {
    idempotencyKey.current = createIdempotencyKey();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setMessage(null);
    try {
      await api.admin.billing.activateManualSubscription(
        {
          companyId,
          plan,
          endsAt: new Date(endsAt).toISOString(),
          reason: reason.trim(),
        },
        idempotencyKey.current,
      );
      resetKey();
      setReason("");
      setMessage({ text: "Подписка активирована." });
      onActivated();
    } catch (error) {
      setMessage({ text: errorText(error, "Не удалось активировать подписку"), error: true });
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="auser-section">
      <div className="auser-section-head">
        <CreditCard aria-hidden size={15} />
        <span>Активировать подписку</span>
      </div>
      <form className="form" onSubmit={submit}>
        <label className="form-field">
          <span>Тариф</span>
          <select
            className="select"
            value={plan}
            onChange={(event) => {
              resetKey();
              setPlan(event.target.value as "basic" | "extended");
            }}
          >
            {subscriptionPlans.map((value) => (
              <option key={value} value={value}>
                {SUBSCRIPTION_PLAN_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>Дата окончания</span>
          <input
            className="input"
            type="date"
            value={endsAt}
            onChange={(event) => {
              resetKey();
              setEndsAt(event.target.value);
            }}
            required
          />
        </label>

        <label className="form-field">
          <span>Причина / комментарий</span>
          <textarea
            className="textarea small"
            placeholder="Например: оплачено по счёту № 123 от 2026-05-19."
            value={reason}
            onChange={(event) => {
              resetKey();
              setReason(event.target.value);
            }}
            minLength={3}
            required
          />
        </label>

        {message ? (
          <p className={`auser-muted${message.error ? " is-error" : ""}`} role={message.error ? "alert" : "status"}>
            {message.text}
          </p>
        ) : null}

        <button className="button" type="submit" disabled={submitting}>
          {submitting ? "Активирую…" : "Активировать подписку"}
        </button>
      </form>
    </section>
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
