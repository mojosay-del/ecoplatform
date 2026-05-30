"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { AdminDashboardSummary, AdminJournalActor } from "@ecoplatform/shared";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CreditCard,
  Database,
  HardDrive,
  Headphones,
  LockKeyhole,
  ScrollText,
  Server,
  ShieldAlert,
  Trash2,
  UserPlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { COMPANY_STATUS_LABELS, SUBSCRIPTION_PLAN_LABELS, labelFromMap } from "../lib/display-labels";
import { AppShell } from "./AppShell";
import { StatusPill } from "./StatusPill";
import { visibleAdminHomeGroups } from "./admin-panel-tabs";

type KpiKey = keyof AdminDashboardSummary["kpis"];
type OperationKey = keyof AdminDashboardSummary["operations"];
type HealthKey = keyof AdminDashboardSummary["systemHealth"];
type KpiTone = "info" | "success" | "warning" | "danger" | "brand";

const KPI_CARDS: Array<{
  key: KpiKey;
  label: string;
  hint: string;
  href: string;
  tone: KpiTone;
  icon: LucideIcon;
}> = [
  {
    key: "activeUsersToday",
    label: "Пользователей сегодня",
    hint: "Уникальные активные сессии",
    href: "/admin/users",
    tone: "info",
    icon: Activity,
  },
  {
    key: "registrationsToday",
    label: "Регистраций сегодня",
    hint: "Новые учётные записи",
    href: "/admin/users",
    tone: "brand",
    icon: UserPlus,
  },
  {
    key: "activeSubscriptions",
    label: "Активных подписок",
    hint: "Оплаченный доступ сейчас",
    href: "/admin/billing",
    tone: "success",
    icon: CreditCard,
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

const ACTION_LABELS: Record<string, string> = {
  "admin.company.status": "Статус компании изменён",
  "admin.legal.document.create": "Юридический документ создан",
  "admin.legal.document.publish": "Юридический документ опубликован",
  "admin.setting.update": "Настройка изменена",
  "admin.staff.create": "Сотрудник добавлен",
  "admin.staff.update": "Сотрудник обновлён",
  "admin.user.block": "Пользователь заблокирован",
  "admin.user.platform_roles": "Роли пользователя изменены",
  "admin.user.unblock": "Пользователь разблокирован",
  "indices.category.create": "Категория индексов создана",
  "indices.category.delete": "Категория индексов удалена",
  "indices.category.update": "Категория индексов обновлена",
  "indices.index.create": "Индекс создан",
  "indices.index.delete": "Индекс удалён",
  "indices.index.publish": "Индекс опубликован",
  "indices.index.unpublish": "Индекс снят с публикации",
  "indices.nomenclature.create": "Номенклатура создана",
  "indices.nomenclature.delete": "Номенклатура удалена",
  "indices.nomenclature.update": "Номенклатура обновлена",
  "indices.value.delete": "Значение индекса удалено",
  "knowledge.create": "Статья базы знаний создана",
  "knowledge.delete": "Статья базы знаний удалена",
  "knowledge.move": "Статья базы знаний перемещена",
  "knowledge.publish": "Статья базы знаний опубликована",
  "knowledge.unpublish": "Статья базы знаний снята с публикации",
  "knowledge.update": "Статья базы знаний обновлена",
  "learning.chapter.create": "Глава курса создана",
  "learning.chapter.delete": "Глава курса удалена",
  "learning.chapter.update": "Глава курса обновлена",
  "learning.lesson.create": "Урок создан",
  "learning.lesson.delete": "Урок удалён",
  "learning.lesson.publish": "Урок опубликован",
  "learning.lesson.unpublish": "Урок снят с публикации",
  "learning.lesson.update": "Урок обновлён",
  "learning.module.create": "Курс создан",
  "learning.module.delete": "Курс удалён",
  "learning.module.publish": "Курс опубликован",
  "learning.module.unpublish": "Курс снят с публикации",
  "learning.module.update": "Курс обновлён",
  manual_subscription_activation: "Подписка активирована вручную",
  "moderation.admin_sanction.module_restriction": "Ограничение модуля применено",
  "moderation.case.lock": "Кейс модерации взят в работу",
  "moderation.case.release": "Кейс модерации освобождён",
  "news.create": "Новость создана",
  "news.delete": "Новость удалена",
  "news.publish": "Новость опубликована",
  "news.unpublish": "Новость снята с публикации",
  "news.update": "Новость обновлена",
};

const NUMBER_FORMAT = new Intl.NumberFormat("ru-RU");
const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit" });
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function AdminHomeView() {
  const router = useRouter();
  const { ready, token, user } = useAuth();
  const roles = user?.platformRoles ?? [];
  const roleKey = roles.join("|");
  const isAdmin = roles.includes("admin");
  const [dashboard, setDashboard] = useState<AdminDashboardSummary | null>(null);
  const [dashboardState, setDashboardState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && roleKey.length === 0) {
      router.replace("/news");
    }
  }, [ready, roleKey, router]);

  useEffect(() => {
    let isActive = true;
    if (!ready || !token || !isAdmin) {
      setDashboard(null);
      setDashboardState("idle");
      setDashboardError(null);
      return;
    }

    setDashboardState("loading");
    setDashboardError(null);
    api.admin
      .dashboard({ token })
      .then((data) => {
        if (!isActive) return;
        setDashboard(data);
        setDashboardState("ready");
      })
      .catch((error) => {
        if (!isActive) return;
        setDashboard(null);
        setDashboardState("error");
        setDashboardError(error instanceof Error ? error.message : "Не удалось загрузить сводку.");
      });

    return () => {
      isActive = false;
    };
  }, [isAdmin, ready, token]);

  const groups = visibleAdminHomeGroups(roles);
  const maxRegistrations = useMemo(() => {
    if (!dashboard) return 1;
    return Math.max(1, ...dashboard.registrationSeries.map((point) => point.count));
  }, [dashboard]);

  return (
    <AppShell>
      <section className="page admin-home">
        <header className="page-header">
          <h1 className="page-title">Панель управления</h1>
          <p className="page-subtitle">Сводка по платформе, последним действиям и быстрым административным разделам.</p>
        </header>

        {isAdmin ? (
          <AdminDashboard
            dashboard={dashboard}
            errorMessage={dashboardError}
            maxRegistrations={maxRegistrations}
            state={dashboardState}
          />
        ) : null}

        {groups.length === 0 ? (
          <p className="page-subtitle">Открываем основной раздел…</p>
        ) : (
          <AdminQuickLinks groups={groups} />
        )}
      </section>
    </AppShell>
  );
}

function AdminDashboard({
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
                <small>{item.hint}</small>
              </span>
            </Link>
          );
        })}
      </div>

      <AdminOperationsPanels operations={dashboard.operations} systemHealth={dashboard.systemHealth} />

      <AdminBusinessPanels business={dashboard.business} />

      <div className="admin-dashboard-main">
        <section className="admin-chart-panel" aria-labelledby="admin-registration-chart-title">
          <header className="admin-dashboard-panel-head">
            <div>
              <h2 id="admin-registration-chart-title">Регистрации за 30 дней</h2>
              <p>Обновлено {DATE_TIME_FORMAT.format(new Date(dashboard.generatedAt))}</p>
            </div>
          </header>
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
              {dashboard.recentAuditEvents.map((event) => (
                <li className="admin-audit-feed-item" key={event.id}>
                  <span className="admin-audit-feed-dot" aria-hidden />
                  <span className="admin-audit-feed-copy">
                    <strong>{formatAction(event.action)}</strong>
                    <small>
                      {event.entityLabel} · {formatActor(event.actor)} ·{" "}
                      {DATE_TIME_FORMAT.format(new Date(event.createdAt))}
                    </small>
                  </span>
                </li>
              ))}
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
  operations,
  systemHealth,
}: {
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
            <p>Короткий статус ключевых зависимостей</p>
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

function AdminQuickLinks({ groups }: { groups: ReturnType<typeof visibleAdminHomeGroups> }) {
  return (
    <section className="admin-home-shortcuts" aria-labelledby="admin-home-shortcuts-title">
      <header className="admin-home-shortcuts-head">
        <h2 id="admin-home-shortcuts-title">Быстрые переходы</h2>
      </header>
      <div className="admin-home-groups">
        {groups.map((group) => (
          <section className="admin-home-section" key={group.title}>
            <header className="admin-home-section-head">
              <h3>{group.title}</h3>
            </header>
            <div className="admin-home-links">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link className="admin-home-link" href={item.href} key={item.href}>
                    <span className="admin-home-link-icon" aria-hidden>
                      <Icon size={18} />
                    </span>
                    <span className="admin-home-link-text">
                      <strong className="admin-home-link-title">{item.label}</strong>
                      <small className="admin-home-link-description">{item.description}</small>
                    </span>
                    <ArrowRight className="admin-home-link-arrow" aria-hidden size={17} />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function formatNumber(value: number) {
  return NUMBER_FORMAT.format(value);
}

function formatAction(action: string) {
  return ACTION_LABELS[action] ?? "Событие журнала";
}

function formatActor(actor: AdminJournalActor | null) {
  if (!actor) return "Системное действие";
  const name = [actor.firstName, actor.lastName]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || actor.email;
}

function formatHealthStatus(status: AdminDashboardSummary["systemHealth"][HealthKey]) {
  if (status === "ok") return "В порядке";
  if (status === "disabled") return "Не настроено";
  return "Нужна проверка";
}
