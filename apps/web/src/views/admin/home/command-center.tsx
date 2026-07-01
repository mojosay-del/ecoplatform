"use client";

// Командный центр администратора на главной /admin: компактный «пульс» KPI,
// блок «Требует внимания» (кликабельные сигналы из открытых задач) и чип
// здоровья систем. Полный дашборд (графики, бизнес-панели, лента аудита)
// остаётся на /admin/analytics.

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  Headphones,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { AdminDashboardSummary } from "@ecoplatform/shared";
import type { ApiState } from "../../shared";
import { StatusPill } from "../../../components/StatusPill";
import { AdminSignalCard, type AdminSignalTone } from "../../../components/admin";
import { KPI_CARDS } from "./dashboard-config";
import { AdminDashboardSkeleton, AdminKpiGrid } from "./kpi-cards";
import type { HealthKey } from "./types";

// «Пульс» — первые четыре бизнес-метрики KPI_CARDS (активность, регистрации,
// активные подписки, истекающие). Остальные две (жалобы, тикеты) показываем
// как сигналы ниже, чтобы не дублировать.
const PULSE_CARDS = KPI_CARDS.slice(0, 4) as typeof KPI_CARDS;

type SignalDef = {
  key: string;
  value: number;
  label: string;
  hint: string;
  icon: LucideIcon;
  href: string;
  tone: AdminSignalTone;
};

function buildSignals(dashboard: AdminDashboardSummary): SignalDef[] {
  const defs: SignalDef[] = [
    {
      key: "openModerationCases",
      value: dashboard.kpis.openModerationCases,
      label: "Открытые жалобы",
      hint: "Кейсы модерации ждут решения",
      icon: ShieldAlert,
      href: "/admin/moderation",
      tone: "danger",
    },
    {
      key: "activeSupportTickets",
      value: dashboard.kpis.activeSupportTickets,
      label: "Активные тикеты",
      hint: "Обращения в поддержку",
      icon: Headphones,
      href: "/admin/support",
      tone: "warning",
    },
    {
      key: "pendingDeletionRequests",
      value: dashboard.operations.pendingDeletionRequests,
      label: "Запросы на удаление",
      hint: "Пользователи ждут обработки",
      icon: Trash2,
      href: "/admin/users",
      tone: "warning",
    },
    {
      key: "pastDueCompanies",
      value: dashboard.operations.pastDueCompanies,
      label: "Просрочка оплаты",
      hint: "Компании в статусе past due",
      icon: CalendarClock,
      href: "/admin/companies",
      tone: "warning",
    },
    {
      key: "lockedAccounts",
      value: dashboard.operations.lockedAccounts,
      label: "Временные блокировки",
      hint: "Аккаунты после неудачных входов",
      icon: LockKeyhole,
      href: "/admin/users",
      tone: "danger",
    },
  ];
  return defs.filter((def) => def.value > 0);
}

function HealthChip({ health }: { health: AdminDashboardSummary["systemHealth"] }) {
  const keys: HealthKey[] = ["database", "redis", "storage"];
  const needsAttention = keys.some((key) => health[key] === "down");
  const variant = needsAttention ? "danger" : "success";
  const label = needsAttention ? "Системы: нужна проверка" : "Системы в норме";
  return (
    <Link className="admin-command-health" href="/admin/analytics" title="Подробно — в Аналитике">
      <StatusPill variant={variant}>{label}</StatusPill>
    </Link>
  );
}

export function AdminCommandCenter({
  dashboard,
  state,
  errorMessage,
}: {
  dashboard: AdminDashboardSummary | null;
  state: ApiState;
  errorMessage: string | null;
}) {
  if (state === "loading" && !dashboard) {
    return <AdminDashboardSkeleton />;
  }
  if (state === "error" && errorMessage) {
    return (
      <StatusPill as="p" variant="danger">
        {errorMessage}
      </StatusPill>
    );
  }
  if (!dashboard) return null;

  const signals = buildSignals(dashboard);

  return (
    <div className="admin-command">
      <section className="admin-command-block">
        <header className="admin-command-block-head">
          <h2 className="admin-command-block-title">Пульс платформы</h2>
          <Link className="admin-command-more" href="/admin/analytics">
            Вся аналитика
            <ArrowUpRight aria-hidden size={15} />
          </Link>
        </header>
        <AdminKpiGrid cards={PULSE_CARDS} dashboard={dashboard} />
      </section>

      <section className="admin-command-block">
        <header className="admin-command-block-head">
          <h2 className="admin-command-block-title">Требует внимания</h2>
          <HealthChip health={dashboard.systemHealth} />
        </header>
        {signals.length > 0 ? (
          <div className="admin-signal-grid">
            {signals.map((signal, index) => (
              <AdminSignalCard
                href={signal.href}
                hint={signal.hint}
                icon={signal.icon}
                index={index}
                key={signal.key}
                label={signal.label}
                tone={signal.tone}
                value={signal.value}
              />
            ))}
          </div>
        ) : (
          <div className="admin-command-clear">
            <span className="admin-command-clear-icon" aria-hidden>
              <ShieldCheck size={24} />
            </span>
            <div>
              <strong>Всё под контролем</strong>
              <p>Открытых жалоб, тикетов и просрочек сейчас нет.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
