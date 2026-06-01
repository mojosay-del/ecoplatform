"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type CSSProperties } from "react";
import { ArrowRight, BadgeCheck, Check, Clock3, CreditCard, Leaf, LockKeyhole, Sparkles, X } from "lucide-react";
import type { AuthMeCompany, SubscriptionPlan } from "@ecoplatform/shared";
import { AppShell } from "../components/AppShell";
import { StatusPill } from "../components/StatusPill";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { COMPANY_STATUS_LABELS, SUBSCRIPTION_PLAN_TITLE_LABELS } from "../lib/display-labels";
import { isSubscriptionSelectionRequired, safeSubscriptionReturnPath } from "../lib/subscription-access";
import { PAID_SUBSCRIPTION_PLAN_TIERS, type PaidSubscriptionPlanTier } from "../lib/subscription-plans";

export function SubscriptionView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, refreshMe } = useAuth();
  const returnPath = useMemo(() => safeSubscriptionReturnPath(searchParams.get("from")), [searchParams]);
  const company = user?.company ?? null;
  const [busyPlan, setBusyPlan] = useState<SubscriptionPlan | null>(null);
  const [activatedPlan, setActivatedPlan] = useState<SubscriptionPlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasActivePaidSubscription =
    company?.status === "active" &&
    Boolean(company.subscriptionPlan) &&
    Boolean(company.subscriptionEndsAt) &&
    new Date(company.subscriptionEndsAt!).getTime() > Date.now();
  const needsSubscription = isSubscriptionSelectionRequired(company);

  async function activatePlan(plan: SubscriptionPlan) {
    if (!token || busyPlan || hasActivePaidSubscription) return;
    setBusyPlan(plan);
    setActivatedPlan(null);
    setMessage(null);
    setErrorMessage(null);
    try {
      await api.billing.activateSubscription(
        { plan },
        {
          idempotencyKey: createSubscriptionIdempotencyKey(plan),
        },
      );
      await refreshMe();
      setActivatedPlan(plan);
      setMessage("Подписка активирована. Возвращаем вас к работе.");
      window.setTimeout(() => router.replace(returnPath), 900);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось активировать подписку.");
    } finally {
      setBusyPlan(null);
    }
  }

  return (
    <AppShell chrome={{ sidebar: false, breadcrumbs: false, notifications: false, demoBanner: false }}>
      <section className="subscription-page">
        <div className="subscription-grid-bg" aria-hidden="true" />
        <div className="subscription-inner">
          <header className="subscription-hero">
            <div className="subscription-copy">
              <span className="subscription-kicker">
                <Leaf size={16} />
                ЭкоПлатформа
              </span>
              <h1>Выберите подписку</h1>
              <p>Доступ к рабочим разделам приостановлен. Выберите тариф, и мы сразу включим платформу на 30 дней.</p>
              <div className="subscription-hero-actions" aria-label="Статус доступа">
                <StatusPill variant={needsSubscription ? "danger" : "success"}>
                  {needsSubscription ? "Нужна подписка" : "Доступ не заблокирован"}
                </StatusPill>
                {company ? (
                  <span>{COMPANY_STATUS_LABELS[company.status] ?? company.status}</span>
                ) : (
                  <span>Компания не найдена</span>
                )}
              </div>
            </div>

            <div className="subscription-visual" aria-hidden="true">
              <div className="subscription-visual-card">
                <span className="subscription-logo-mark">
                  <Image alt="" src="/brand/logo.webp" width={38} height={38} priority />
                </span>
                <div className="subscription-visual-lines">
                  <span />
                  <span />
                  <span />
                </div>
                <strong>30 дней</strong>
                <small>доступ включится сразу</small>
              </div>
            </div>
          </header>

          <div className="subscription-status-panel">
            <div>
              <span>Компания</span>
              <strong>{company?.organizationName ?? "Не определена"}</strong>
            </div>
            <div>
              <span>Текущий доступ</span>
              <strong>{describeCurrentAccess(company)}</strong>
            </div>
            <div>
              <span>После выбора</span>
              <strong>Активно на 30 дней</strong>
            </div>
          </div>

          {hasActivePaidSubscription ? (
            <div className="subscription-flash success">
              <BadgeCheck size={18} />
              <span>Подписка уже активна. Продление через оплату появится вместе с Тинькофф Кассой.</span>
            </div>
          ) : null}
          {message ? (
            <div className="subscription-flash success">
              <BadgeCheck size={18} />
              <span>{message}</span>
            </div>
          ) : null}
          {errorMessage ? (
            <div className="subscription-flash danger">
              <LockKeyhole size={18} />
              <span>{errorMessage}</span>
            </div>
          ) : null}

          <div className="subscription-plan-grid">
            {PAID_SUBSCRIPTION_PLAN_TIERS.map((tier, index) => (
              <SubscriptionPlanCard
                disabled={!company || hasActivePaidSubscription}
                index={index}
                key={tier.key}
                onActivate={activatePlan}
                pending={busyPlan === tier.key}
                selected={activatedPlan === tier.key}
                tier={tier}
              />
            ))}
          </div>

          <div className="subscription-proof-row">
            <span>
              <Clock3 size={16} />
              Месяц доступа
            </span>
            <span>
              <CreditCard size={16} />
              Онлайн-оплата следующим шагом
            </span>
            <span>
              <Sparkles size={16} />
              Тариф можно будет продлить
            </span>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function SubscriptionPlanCard({
  disabled,
  index,
  onActivate,
  pending,
  selected,
  tier,
}: {
  disabled: boolean;
  index: number;
  onActivate: (plan: SubscriptionPlan) => void;
  pending: boolean;
  selected: boolean;
  tier: PaidSubscriptionPlanTier;
}) {
  const buttonLabel = selected
    ? "Подписка активирована"
    : pending
      ? "Активируем..."
      : tier.key === "basic"
        ? "Выбрать базовую"
        : "Выбрать расширенную";
  return (
    <article
      className={`subscription-plan-card accent-${tier.accent}${tier.badge ? " is-featured" : ""}${selected ? " is-selected" : ""}`}
      style={{ "--subscription-card-delay": `${index * 90}ms` } as CSSProperties & Record<string, string>}
    >
      {tier.badge ? <span className="subscription-plan-badge">{tier.badge}</span> : null}
      <div className="subscription-plan-head">
        <span className="subscription-plan-icon">
          {tier.key === "basic" ? <Leaf size={22} /> : <Sparkles size={22} />}
        </span>
        <div>
          <h2>{tier.name}</h2>
          <p>{tier.description}</p>
        </div>
      </div>

      <div className="subscription-plan-price">
        <strong>{tier.price ?? "Цена скоро"}</strong>
        <span>активация на 30 дней</span>
      </div>

      <ul className="subscription-feature-list">
        {tier.features.map((feature) => (
          <li className={feature.included ? undefined : "is-muted"} key={feature.label}>
            <span>{feature.included ? <Check size={13} /> : <X size={13} />}</span>
            {feature.label}
          </li>
        ))}
      </ul>

      <button
        className="button subscription-plan-button"
        disabled={disabled || pending || selected}
        type="button"
        onClick={() => onActivate(tier.key)}
      >
        <span>{buttonLabel}</span>
        {!pending && !selected ? <ArrowRight size={16} /> : null}
      </button>
    </article>
  );
}

function describeCurrentAccess(company: AuthMeCompany | null): string {
  if (!company) return "Нет компании";
  if (company.status === "active" && company.subscriptionPlan) {
    return SUBSCRIPTION_PLAN_TITLE_LABELS[company.subscriptionPlan] ?? company.subscriptionPlan;
  }
  if (company.status === "demo") return "Демо-доступ";
  return COMPANY_STATUS_LABELS[company.status] ?? company.status;
}

function createSubscriptionIdempotencyKey(plan: SubscriptionPlan): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `self-subscription-${plan}-${random}`;
}
