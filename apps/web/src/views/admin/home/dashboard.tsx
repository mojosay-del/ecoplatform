"use client";

// Полный дашборд администратора: KPI-карточки, операционные сигналы, здоровье
// системы, бизнес-метрики, график регистраций и лента аудита. Видит только
// роль admin (для остального персонала — StaffRoleSummary в quick-links.tsx).

import { useMemo, type CSSProperties } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CreditCard,
  Database,
  HardDrive,
  Headphones,
  LockKeyhole,
  Minus,
  ScrollText,
  Server,
  ShieldAlert,
  Trash2,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { AdminDashboardSummary } from "@ecoplatform/shared";
import { StatusPill } from "../../../components/StatusPill";
import { COMPANY_STATUS_LABELS, SUBSCRIPTION_PLAN_LABELS, labelFromMap } from "../../../lib/display-labels";
import type { HealthKey, KpiKey, KpiPolarity, KpiTone, KpiTrendKey, OperationKey } from "./types";
import {
  DATE_FORMAT,
  DATE_TIME_FORMAT,
  TIME_FORMAT,
  auditVisual,
  deltaTone,
  formatAction,
  formatActor,
  formatHealthStatus,
  formatNumber,
  formatRelativeTime,
} from "./format";

const KPI_CARDS: Array<{
  key: KpiKey;
  label: string;
  hint: string;
  href: string;
  tone: KpiTone;
  icon: LucideIcon;
  trendKey?: KpiTrendKey;
  polarity?: KpiPolarity;
}> = [
  {
    key: "activeUsersToday",
    label: "Пользователей сегодня",
    hint: "Уникальные активные сессии",
    href: "/admin/users",
    tone: "info",
    icon: Activity,
    trendKey: "activeUsersToday",
    polarity: "up-good",
  },
  {
    key: "registrationsToday",
    label: "Регистраций сегодня",
    hint: "Новые учётные записи",
    href: "/admin/users",
    tone: "brand",
    icon: UserPlus,
    trendKey: "registrationsToday",
    polarity: "up-good",
  },
  {
    key: "activeSubscriptions",
    label: "Активных подписок",
    hint: "Оплаченный доступ сейчас",
    href: "/admin/billing",
    tone: "success",
    icon: CreditCard,
    trendKey: "activeSubscriptions",
    polarity: "up-good",
  },
  {
    key: "subscriptionsExpiringSoon",
    label: "Истекают за 7 дней",
    hint: "Подписки на продление",
    href: "/admin/billing",
    tone: "warning",
    icon: CalendarClock,
  },
  {
    key: "openModerationCases",
    label: "Открытых жалоб",
    hint: "Кейсы требуют решения",
    href: "/admin/moderation",
    tone: "danger",
    icon: ShieldAlert,
  },
  {
    key: "activeSupportTickets",
    label: "Активных тикетов",
    hint: "Новые и в работе",
    href: "/admin/support",
    tone: "warning",
    icon: Headphones,
  },
];

const OPERATION_CARDS: Array<{
  key: OperationKey;
  label: string;
  hint: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    key: "pendingDeletionRequests",
    label: "Запросы на удаление",
    hint: "Пользователи ждут обработки",
    href: "/admin/users",
    icon: Trash2,
  },
  {
    key: "pastDueCompanies",
    label: "Просрочка оплаты",
    hint: "Компании в статусе past due",
    href: "/admin/companies",
    icon: CalendarClock,
  },
  {
    key: "lockedAccounts",
    label: "Временные блокировки",
    hint: "Аккаунты после неудачных входов",
    href: "/admin/users",
    icon: LockKeyhole,
  },
];

const HEALTH_DEPENDENCIES: Array<{
  key: HealthKey;
  label: string;
  hint: string;
  icon: LucideIcon;
}> = [
  { key: "database", label: "Postgres", hint: "Основная база данных", icon: Database },
  { key: "redis", label: "Redis", hint: "Кэш сессий и лимитов", icon: Server },
  { key: "storage", label: "S3", hint: "Файлы и изображения", icon: HardDrive },
];

export function AdminDashboard({
  dashboard,
  errorMessage,
  maxRegistrations,
  state,
}: {
  dashboard: AdminDashboardSummary | null;
  errorMessage: string | null;
  maxRegistrations: number;
  state: "idle" | "loading" | "ready" | "error";
}) {
  const chartStats = useMemo(() => {
    const series = dashboard?.registrationSeries ?? [];
    if (series.length === 0) return { total: 0, avg: 0, peak: 0, avgRatio: 0 };
    const total = series.reduce((sum, point) => sum + point.count, 0);
    const peak = Math.max(...series.map((point) => point.count));
    const avgExact = total / series.length;
    return { total, avg: Math.round(avgExact), peak, avgRatio: peak > 0 ? avgExact / peak : 0 };
  }, [dashboard]);

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

  return (
    <section className="admin-dashboard" aria-label="Сводка администратора">
      <div className="admin-kpi-grid">
        {KPI_CARDS.map((item, index) => {
          const Icon = item.icon;
          const previous = item.trendKey ? dashboard.kpiTrends[item.trendKey] : null;
          const delta = previous === null ? null : dashboard.kpis[item.key] - previous;
          return (
            <Link
              className={`admin-kpi-card admin-kpi-card-${item.tone}`}
              href={item.href}
              key={item.key}
              style={{ "--kpi-delay": `${index * 45}ms` } as CSSProperties}
            >
              <span className="admin-kpi-card-icon" aria-hidden>
                <Icon size={18} />
              </span>
              <span className="admin-kpi-card-copy">
                <span className="admin-kpi-card-label">{item.label}</span>
                <strong className="admin-kpi-card-value">{formatNumber(dashboard.kpis[item.key])}</strong>
                {delta !== null ? <KpiDelta delta={delta} polarity={item.polarity ?? "up-good"} /> : null}
                <small>{item.hint}</small>
              </span>
            </Link>
          );
        })}
      </div>

      <AdminOperationsPanels
        generatedAt={dashboard.generatedAt}
        operations={dashboard.operations}
        systemHealth={dashboard.systemHealth}
      />

      <AdminBusinessPanels business={dashboard.business} />

      <div className="admin-dashboard-main">
        <section className="admin-chart-panel" aria-labelledby="admin-registration-chart-title">
          <header className="admin-dashboard-panel-head">
            <div>
              <h2 id="admin-registration-chart-title">Регистрации за 30 дней</h2>
              <p>Обновлено {DATE_TIME_FORMAT.format(new Date(dashboard.generatedAt))}</p>
            </div>
            <dl className="admin-chart-legend">
              <div>
                <dt>Всего</dt>
                <dd>{formatNumber(chartStats.total)}</dd>
              </div>
              <div>
                <dt>Среднее</dt>
                <dd>{formatNumber(chartStats.avg)}/дн</dd>
              </div>
              <div>
                <dt>Пик</dt>
                <dd>{formatNumber(chartStats.peak)}</dd>
              </div>
            </dl>
          </header>
          <div className="admin-chart-plot" style={{ "--avg-ratio": chartStats.avgRatio } as CSSProperties}>
            <div className="admin-registration-chart" role="list">
              {dashboard.registrationSeries.map((point, index) => {
                const height = Math.max(8, Math.round((point.count / maxRegistrations) * 100));
                const date = new Date(`${point.date}T00:00:00`);
                const isEdgeLabel = index === 0 || index === dashboard.registrationSeries.length - 1;
                return (
                  <div className="admin-chart-day" key={point.date} role="listitem">
                    <span
                      aria-label={`${DATE_FORMAT.format(date)}: ${point.count}`}
                      className="admin-chart-bar"
                      style={
                        {
                          "--bar-delay": `${index * 16}ms`,
                          "--bar-height": `${height}%`,
                        } as CSSProperties
                      }
                    >
                      <span className="admin-chart-bar-tooltip">
                        {DATE_FORMAT.format(date)} · {formatNumber(point.count)}
                      </span>
                    </span>
                    {isEdgeLabel ? <span className="admin-chart-day-label">{DATE_FORMAT.format(date)}</span> : null}
                  </div>
                );
              })}
            </div>
            {chartStats.total > 0 ? (
              <span className="admin-chart-avg" aria-hidden>
                <span className="admin-chart-avg-label">среднее {formatNumber(chartStats.avg)}</span>
              </span>
            ) : null}
          </div>
        </section>

        <section className="admin-audit-panel" aria-labelledby="admin-audit-feed-title">
          <header className="admin-dashboard-panel-head">
            <div>
              <h2 id="admin-audit-feed-title">Последние события аудита</h2>
              <p>5 свежих действий админки</p>
            </div>
            <Link className="button secondary" href="/admin/journals">
              <ScrollText aria-hidden size={16} />
              Журнал
            </Link>
          </header>
          {dashboard.recentAuditEvents.length ? (
            <ol className="admin-audit-feed">
              {dashboard.recentAuditEvents.map((event) => {
                const visual = auditVisual(event.action);
                const Icon = visual.icon;
                const createdAt = new Date(event.createdAt);
                return (
                  <li className="admin-audit-feed-item" key={event.id}>
                    <span className={`admin-audit-feed-icon admin-audit-tone-${visual.tone}`} aria-hidden>
                      <Icon size={13} />
                    </span>
                    <span className="admin-audit-feed-copy">
                      <strong>{formatAction(event.action)}</strong>
                      <small>
                        {event.entityLabel} · {formatActor(event.actor)} ·{" "}
                        <time dateTime={event.createdAt} title={DATE_TIME_FORMAT.format(createdAt)}>
                          {formatRelativeTime(createdAt)}
                        </time>
                      </small>
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="page-subtitle">Событий пока нет.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function AdminOperationsPanels({
  generatedAt,
  operations,
  systemHealth,
}: {
  generatedAt: string;
  operations: AdminDashboardSummary["operations"];
  systemHealth: AdminDashboardSummary["systemHealth"];
}) {
  return (
    <section className="admin-ops-health-grid" aria-label="Операции и здоровье системы">
      <section className="admin-operations-panel">
        <header className="admin-dashboard-panel-head">
          <div>
            <h2>Требует внимания</h2>
            <p>Операционные сигналы, которые лучше не пропускать</p>
          </div>
        </header>
        <div className="admin-operation-list">
          {OPERATION_CARDS.map((item) => {
            const Icon = item.icon;
            const value = operations[item.key];
            return (
              <Link
                className={`admin-operation-row${value > 0 ? " is-attention" : ""}`}
                href={item.href}
                key={item.key}
              >
                <span className="admin-operation-row-icon" aria-hidden>
                  <Icon size={18} />
                </span>
                <span className="admin-operation-row-copy">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </span>
                <span className="admin-operation-row-value">{formatNumber(value)}</span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="admin-health-panel">
        <header className="admin-dashboard-panel-head">
          <div>
            <h2>Здоровье системы</h2>
            <p>Ключевые зависимости · проверено в {TIME_FORMAT.format(new Date(generatedAt))}</p>
          </div>
        </header>
        <dl className="admin-health-list">
          {HEALTH_DEPENDENCIES.map((item) => {
            const Icon = item.icon;
            const status = systemHealth[item.key];
            return (
              <div className={`admin-health-row admin-health-row-${status}`} key={item.key}>
                <dt>
                  <span className="admin-health-row-icon" aria-hidden>
                    <Icon size={18} />
                  </span>
                  <span className="admin-health-row-copy">
                    <strong>{item.label}</strong>
                    <small>{item.hint}</small>
                  </span>
                </dt>
                <dd>
                  <span className={`admin-health-status admin-health-status-${status}`}>
                    {formatHealthStatus(status)}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      </section>
    </section>
  );
}

function AdminBusinessPanels({ business }: { business: AdminDashboardSummary["business"] }) {
  return (
    <section className="admin-business-grid" aria-label="Подписки и компании">
      <section className="admin-business-panel">
        <header className="admin-dashboard-panel-head">
          <div>
            <h2>Подписки</h2>
            <p>Конверсия и структура платного доступа</p>
          </div>
        </header>
        <div className="admin-business-hero">
          <strong className="admin-business-hero-value">{business.conversion.percent}%</strong>
          <span className="admin-business-hero-label">
            конверсия демо → платная
            <br />
            {formatNumber(business.conversion.convertedCompanies)} из {formatNumber(business.conversion.totalCompanies)}{" "}
            компаний
          </span>
        </div>
        <dl className="admin-stat-list">
          <div className="admin-stat-row">
            <dt>{labelFromMap(SUBSCRIPTION_PLAN_LABELS, "basic")}</dt>
            <dd>{formatNumber(business.subscriptionsByPlan.basic)}</dd>
          </div>
          <div className="admin-stat-row">
            <dt>{labelFromMap(SUBSCRIPTION_PLAN_LABELS, "extended")}</dt>
            <dd>{formatNumber(business.subscriptionsByPlan.extended)}</dd>
          </div>
          <div className="admin-stat-row">
            <dt>Новых подписок за месяц</dt>
            <dd>{formatNumber(business.newSubscriptionsThisMonth)}</dd>
          </div>
        </dl>
      </section>

      <section className="admin-business-panel">
        <header className="admin-dashboard-panel-head">
          <div>
            <h2>Компании по статусам</h2>
            <p>Всего {formatNumber(business.conversion.totalCompanies)}</p>
          </div>
        </header>
        {business.companiesByStatus.length ? (
          <dl className="admin-stat-list">
            {business.companiesByStatus.map((row) => (
              <div className="admin-stat-row" key={row.status}>
                <dt>{labelFromMap(COMPANY_STATUS_LABELS, row.status)}</dt>
                <dd>{formatNumber(row.count)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="page-subtitle">Компаний пока нет.</p>
        )}
      </section>
    </section>
  );
}

function AdminDashboardSkeleton() {
  return (
    <section className="admin-dashboard admin-dashboard-loading" aria-label="Загрузка сводки администратора">
      <div className="admin-kpi-grid" aria-hidden>
        {KPI_CARDS.map((item) => (
          <div className="admin-kpi-card admin-kpi-card-skeleton" key={item.key}>
            <span className="admin-kpi-card-icon" />
            <span className="admin-kpi-card-copy">
              <span className="admin-skeleton-line admin-skeleton-line-short" />
              <span className="admin-skeleton-line admin-skeleton-line-value" />
              <span className="admin-skeleton-line" />
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function KpiDelta({ delta, polarity }: { delta: number; polarity: KpiPolarity }) {
  const tone = deltaTone(delta, polarity);
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={`admin-kpi-delta admin-kpi-delta-${tone}`} title="За сутки — к этому же времени вчера">
      <Icon aria-hidden size={12} />
      {sign}
      {formatNumber(delta)}
    </span>
  );
}
