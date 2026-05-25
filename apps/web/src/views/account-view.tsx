"use client";

// Личный кабинет: профиль, безопасность (сессии, смена пароля), уведомления,
// биллинг и список тикетов поддержки. Самый крупный view в проекте — раньше
// жил в DataViews.tsx, теперь изолирован.

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Bell,
  Building2,
  CreditCard,
  KeyRound,
  LifeBuoy,
  LogOut,
  ShieldCheck,
  Smartphone,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import type { BillingStatus, BillingSubscription, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../components/AppShell";
import { api, clearAccessToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AuthRequired, ErrorState, useApiQuery, resolveUpgradeCta } from "./_shared";

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  moderator: "Модератор",
  content_manager: "Контент-менеджер",
};

const COMPANY_STATUS_LABELS: Record<string, string> = {
  demo: "Демо",
  active: "Активна",
  past_due: "Подписка просрочена",
  suspended: "Приостановлена",
  blocked: "Заблокирована",
  archived: "В архиве",
};

const COMPANY_TYPE_LABELS: Record<string, string> = {
  collector: "Заготовитель",
  trader: "Трейдер",
  processor: "Переработчик",
};

const GENDER_LABELS: Record<string, string> = {
  male: "Мужской",
  female: "Женский",
};

// Какую CTA «обновления тарифа» показывать сверху урока:
// — нет компании (стафф) или extended-подписка → ничего;
// — basic-подписка → предложить Расширенный доступ;
// — demo/past_due/blocked → предложить Полный доступ.
// resolveUpgradeCta переехала в ../views/_shared.tsx

function describeSubscription(
  billing: {
    status?: string;
    subscriptionPlan?: string | null;
    demoEndsAt?: string | null;
    subscriptionEndsAt?: string | null;
  } | null,
) {
  if (!billing) {
    return { tariff: "не активирован", note: "Подписка не активна" };
  }
  if (billing.status === "demo") {
    const endsAt = billing.demoEndsAt ? new Date(billing.demoEndsAt) : null;
    const expired = endsAt ? endsAt.getTime() <= Date.now() : false;
    return {
      tariff: "Демо-доступ",
      note: endsAt
        ? expired
          ? `Демо истёк ${endsAt.toLocaleString("ru-RU")}. Активируйте подписку.`
          : `Демо до ${endsAt.toLocaleString("ru-RU")}`
        : "Демо без срока",
    };
  }
  if (billing.status === "active" && billing.subscriptionPlan) {
    const endsAt = billing.subscriptionEndsAt ? new Date(billing.subscriptionEndsAt) : null;
    return {
      tariff: billing.subscriptionPlan === "basic" ? "Базовая подписка" : "Расширенная подписка",
      note: endsAt ? `Действует до ${endsAt.toLocaleString("ru-RU")}` : "Подписка активна",
    };
  }
  if (billing.status === "past_due")
    return { tariff: "Подписка просрочена", note: "Свяжитесь с поддержкой для продления." };
  if (billing.status === "suspended") return { tariff: "Приостановлена", note: "Доступ к разделам временно закрыт." };
  if (billing.status === "blocked") return { tariff: "Заблокирована", note: "Компания заблокирована." };
  return { tariff: "не активирован", note: "Подписка не активна" };
}

type AccountTab = "profile" | "company" | "billing" | "security" | "notifications" | "support";

type AccountSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  rememberMe: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  current: boolean;
};

type NotificationPreferences = {
  inAppMutedCategories: string[];
  emailMutedCategories: string[];
};

type AccountSupportTicket = {
  id: string;
  category: string;
  subject: string;
  status: string;
  updatedAt: string;
};

const ACCOUNT_TABS: Array<{ id: AccountTab; label: string; icon: LucideIcon; companyOnly?: boolean }> = [
  { id: "profile", label: "Профиль", icon: UserRound },
  { id: "company", label: "Компания", icon: Building2, companyOnly: true },
  { id: "billing", label: "Подписка", icon: CreditCard, companyOnly: true },
  { id: "security", label: "Безопасность", icon: ShieldCheck },
  { id: "notifications", label: "Уведомления", icon: Bell },
  { id: "support", label: "Поддержка", icon: LifeBuoy, companyOnly: true },
];

const NOTIFICATION_ROWS: Array<{
  category: string;
  label: string;
  description: string;
  locked?: boolean;
  companyOnly?: boolean;
}> = [
  {
    category: "security",
    label: "Безопасность",
    description: "Входы, смена пароля и отзыв сессий.",
    locked: true,
  },
  {
    category: "billing",
    label: "Биллинг",
    description: "Счета, платежи, документы и статусы подписки.",
    locked: true,
    companyOnly: true,
  },
  {
    category: "marketplace",
    label: "Торговая площадка",
    description: "Объявления, предложения и статусы сделок.",
    companyOnly: true,
  },
  {
    category: "moderation",
    label: "Модерация",
    description: "Решения по жалобам, ограничения и предупреждения.",
  },
  {
    category: "support",
    label: "Поддержка",
    description: "Ответы администратора и статусы обращений.",
  },
  {
    category: "system",
    label: "Системные",
    description: "Правила, обновления и технические работы.",
  },
];

const SUPPORT_CATEGORY_LABELS: Record<string, string> = {
  billing: "Биллинг",
  moderation_review: "Модерация",
  company_management: "Компания",
  technical: "Технический вопрос",
  data_deletion: "Удаление данных",
  other: "Другое",
};

const SUPPORT_STATUS_LABELS: Record<string, string> = {
  new: "Новое",
  open: "Открыт",
  in_progress: "В работе",
  awaiting_user: "Ждёт ответа",
  resolved: "Решён",
  closed: "Закрыт",
};

function accountDash(value: ReactNode) {
  return value || <span className="account-muted">Не заполнено</span>;
}

function formatAccountDateTime(value?: string | Date | null) {
  return value ? new Date(value).toLocaleString("ru-RU") : "—";
}

function formatAccountDate(value?: string | Date | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "—";
}

function describeSessionDevice(userAgent?: string | null) {
  if (!userAgent) return "Неизвестное устройство";
  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /Firefox\//i.test(userAgent)
      ? "Firefox"
      : /Chrome\//i.test(userAgent)
        ? "Chrome"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : "Браузер";
  const os = /Windows NT/i.test(userAgent)
    ? "Windows"
    : /Mac OS X|Macintosh/i.test(userAgent)
      ? "macOS"
      : /Android/i.test(userAgent)
        ? "Android"
        : /iPhone|iPad/i.test(userAgent)
          ? "iOS"
          : /Linux/i.test(userAgent)
            ? "Linux"
            : "ОС";
  return `${browser} · ${os}`;
}

function AccountDetailList({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="account-detail-list">
      {rows.map((row) => (
        <div className="account-detail-row" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{accountDash(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function getAccountModuleCards(companyType?: string | null, status?: string | null, plan?: string | null) {
  const locked = status === "suspended" || status === "blocked" || status === "archived";
  const baseAccess = locked ? "Закрыто" : "Доступно";
  const buyerRole = companyType === "collector" ? "Мои объявления" : "Мои предложения";

  return [
    {
      title: "Торговая площадка",
      state: locked ? "Закрыто" : companyType === "collector" ? "Продавец" : "Покупатель",
      description: companyType ? buyerRole : "Сценарий зависит от типа компании.",
    },
    {
      title: "Новости и индексы",
      state: baseAccess,
      description: "Открыты в демо, базовой и расширенной подписке.",
    },
    {
      title: "База знаний",
      state: baseAccess,
      description: "Сырьё, справочники и документация по рынку.",
    },
    {
      title: "Обучение",
      state: plan === "extended" ? "Расширенное" : locked ? "Закрыто" : "Базовое",
      description: "Расширенные модули требуют расширенной подписки или разовой покупки.",
    },
    {
      title: "Калькуляторы и инструменты",
      state: locked ? "Закрыто" : "По доступу",
      description: "Часть инструментов открывается подпиской, часть — разовой покупкой.",
    },
    {
      title: "Магазин и форум",
      state: locked ? "Закрыто" : "В кабинете",
      description: "Покупки доступны активным компаниям; форум входит в общий контур.",
    },
  ];
}

export function AccountView() {
  const { user, token, logout } = useAuth();
  const isPlatformStaff = (user?.platformRoles?.length ?? 0) > 0;
  const { data: billing } = useApiQuery<BillingStatus | null>(
    isPlatformStaff ? null : "billing-status",
    () => api.billing.status(),
    null,
  );
  const {
    data: sessions,
    setData: setSessions,
    state: sessionsState,
  } = useApiQuery("auth-sessions", () => api.auth.listSessions(), [] as AccountSession[]);
  const {
    data: notificationPreferences,
    setData: setNotificationPreferences,
    state: notificationPreferencesState,
  } = useApiQuery<NotificationPreferences | null>(
    "notification-preferences",
    () => api.notifications.preferences.get(),
    null,
  );
  const { data: supportTickets, state: supportState } = useApiQuery(
    isPlatformStaff ? null : "support-tickets",
    () => api.support.listMyTickets(),
    { items: [], total: 0, hasMore: false } as PaginatedResponse<AccountSupportTicket>,
  );
  const [activeTab, setActiveTab] = useState<AccountTab>("profile");
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [notificationBusyKey, setNotificationBusyKey] = useState<string | null>(null);

  const tabs = useMemo(() => ACCOUNT_TABS.filter((tab) => !tab.companyOnly || !isPlatformStaff), [isPlatformStaff]);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id ?? "profile");
    }
  }, [activeTab, tabs]);

  // Подписка и статус компании теперь рендерятся в отдельных карточках —
  // форма поддержки переехала в drawer (иконка «?» в шапке), чтобы личный
  // кабинет был спокойной страницей профиля, а не свалкой всех функций.
  const subscription = describeSubscription(billing);
  const companyStatusLabel = billing?.status ? (COMPANY_STATUS_LABELS[billing.status] ?? billing.status) : null;
  const fullName = user ? `${user.firstName} ${user.lastName}` : "Не авторизован";
  const initials = user ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() : "";
  // Раньше тут был fallback на `user?.company`, но у юзера в auth-контексте
  // лежит only-name shape — нет реквизитов и подписок. Тип BillingStatus
  // полнее и приходит сразу после refresh, так что фолбэк был вестигиальным.
  const company = billing;
  const latestSubscription = billing?.subscriptions?.[0] ?? null;
  const supportPreview = supportTickets.items.slice(0, 4);

  function openSupport() {
    window.dispatchEvent(new Event("support:open"));
  }

  async function onChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const repeatPassword = String(formData.get("repeatPassword") ?? "");

    setPasswordMessage(null);
    if (newPassword !== repeatPassword) {
      setPasswordMessage("Новый пароль и повтор не совпадают.");
      return;
    }

    setPasswordSaving(true);
    try {
      await api.auth.changePassword({ currentPassword, newPassword });
      form.reset();
      setPasswordMessage("Пароль изменён. Остальные активные сессии отозваны.");
      setSessions((current) => current.filter((session) => session.current));
      window.dispatchEvent(new Event("notifications:changed"));
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "Не удалось изменить пароль.");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function revokeSession(sessionId: string) {
    if (!token) return;
    setSessionBusyId(sessionId);
    try {
      const result = await api.auth.revokeSession(sessionId);
      if (result.revokedCurrent) {
        clearAccessToken();
        window.location.assign("/login");
        return;
      }
      setSessions((current) => current.filter((session) => session.id !== sessionId));
    } finally {
      setSessionBusyId(null);
    }
  }

  async function logoutEverywhere() {
    if (!token) return;
    const ok = window.confirm("Завершить все активные сессии и перейти на страницу входа?");
    if (!ok) return;
    setSessionBusyId("all");
    try {
      await api.auth.logoutAll();
      clearAccessToken();
      window.location.assign("/login");
    } finally {
      setSessionBusyId(null);
    }
  }

  function notificationEnabled(category: string, channel: "in_app" | "email") {
    if (category === "security" || category === "billing") return true;
    const muted =
      channel === "in_app"
        ? (notificationPreferences?.inAppMutedCategories ?? [])
        : (notificationPreferences?.emailMutedCategories ?? []);
    return !muted.includes(category);
  }

  async function updateNotificationPreference(category: string, channel: "in_app" | "email", enabled: boolean) {
    if (!token || category === "security" || category === "billing") return;
    const field = channel === "in_app" ? "inAppMutedCategories" : "emailMutedCategories";
    const currentPreferences = notificationPreferences ?? {
      inAppMutedCategories: [],
      emailMutedCategories: [],
    };
    const currentMuted = currentPreferences[field];
    const nextMuted = enabled
      ? currentMuted.filter((item) => item !== category)
      : [...new Set([...currentMuted, category])];
    const nextPreferences = {
      ...currentPreferences,
      [field]: nextMuted,
    };
    const busyKey = `${category}:${channel}`;
    setNotificationBusyKey(busyKey);
    setNotificationPreferences(nextPreferences);
    try {
      const saved = await api.notifications.preferences.update(nextPreferences);
      setNotificationPreferences(saved);
    } finally {
      setNotificationBusyKey(null);
    }
  }

  return (
    <AppShell>
      <section className="page">
        {/* Hero: крупный аватар и основная идентификация пользователя.
            Раньше аватар был 40px и терялся среди карточек. */}
        <header className="account-hero">
          <div className="account-hero-profile">
            <div className="account-hero-avatar" aria-hidden={!user?.avatarUrl}>
              {user?.avatarUrl ? (
                <Image alt="" src={user.avatarUrl} width={128} height={128} />
              ) : (
                <span className="account-hero-initials">{initials || "?"}</span>
              )}
            </div>
            <button className="button secondary" onClick={logout}>
              Выйти
            </button>
          </div>
          <div className="account-hero-info">
            <h1 className="account-hero-name">{fullName}</h1>
            {user?.email ? <p className="account-hero-email">{user.email}</p> : null}
            <div className="account-hero-meta">
              {user?.gender ? <span className="status-pill">{GENDER_LABELS[user.gender] ?? user.gender}</span> : null}
              {isPlatformStaff
                ? user?.platformRoles?.map((role) => (
                    <span className="status-pill primary" key={role}>
                      {ROLE_LABELS[role] ?? role}
                    </span>
                  ))
                : null}
              {companyStatusLabel && !isPlatformStaff ? (
                <span className="status-pill">{companyStatusLabel}</span>
              ) : null}
            </div>
            <p className="account-hero-hint">
              Фото профиля подбирается автоматически по типу компании. Возможность загрузить своё появится в следующих
              обновлениях.
            </p>
          </div>
        </header>

        <nav className="account-tabs" aria-label="Разделы личного кабинета">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                className={`account-tab ${activeTab === tab.id ? "active" : ""}`}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {activeTab === "profile" ? (
          <div className="account-section-grid">
            <article className="card account-card">
              <h2>Пользователь</h2>
              <AccountDetailList
                rows={[
                  { label: "Имя", value: fullName },
                  { label: "Email", value: user?.email },
                  { label: "Телефон", value: user?.phone },
                  { label: "Статус", value: <span className="status-pill">Активен</span> },
                ]}
              />
            </article>
            <article className="card account-card">
              <h2>Контакты</h2>
              <p className="page-subtitle">
                Email используется для безопасности, биллинга и уведомлений. Телефон нужен для SMS-кодов.
              </p>
              <div className="account-action-list">
                <button className="button secondary" type="button" disabled>
                  Сменить email
                </button>
                <button className="button secondary" type="button" disabled>
                  Сменить телефон
                </button>
              </div>
            </article>
            {isPlatformStaff ? (
              <article className="card account-card">
                <h2>Сотрудник платформы</h2>
                <p className="page-subtitle">Этот аккаунт не привязан к клиентской компании.</p>
                <div className="account-pill-row">
                  {user?.platformRoles?.map((role) => (
                    <span className="status-pill primary" key={role}>
                      {ROLE_LABELS[role] ?? role}
                    </span>
                  ))}
                </div>
              </article>
            ) : null}
          </div>
        ) : null}

        {activeTab === "company" && !isPlatformStaff ? (
          <div className="account-panel-stack">
            <div className="account-section-grid">
              <article className="card account-card">
                <h2>Компания</h2>
                <AccountDetailList
                  rows={[
                    { label: "Название", value: company?.organizationName },
                    {
                      label: "Тип",
                      value: company?.type ? (COMPANY_TYPE_LABELS[company.type] ?? company.type) : null,
                    },
                    {
                      label: "Статус",
                      value: company?.status ? (
                        <span className="status-pill">{COMPANY_STATUS_LABELS[company.status] ?? company.status}</span>
                      ) : null,
                    },
                  ]}
                />
              </article>
              <article className="card account-card">
                <h2>Реквизиты</h2>
                <AccountDetailList
                  rows={[
                    { label: "ИНН", value: company?.billingInn },
                    { label: "КПП", value: company?.billingKpp },
                    { label: "Юридический адрес", value: company?.legalAddress },
                    { label: "Банк", value: company?.bankName },
                    { label: "БИК", value: company?.bankBik },
                    { label: "Расчётный счёт", value: company?.bankAccount },
                    { label: "Корр. счёт", value: company?.correspondentAccount },
                  ]}
                />
                <div className="account-action-list">
                  <button className="button secondary" type="button" disabled>
                    Редактировать реквизиты
                  </button>
                </div>
              </article>
            </div>
            <section className="account-module-grid" aria-label="Доступные модули">
              {getAccountModuleCards(company?.type, company?.status, company?.subscriptionPlan).map((item) => (
                <article className="account-module-card" key={item.title}>
                  <div>
                    <h2>{item.title}</h2>
                    <p>{item.description}</p>
                  </div>
                  <span className="status-pill">{item.state}</span>
                </article>
              ))}
            </section>
          </div>
        ) : null}

        {activeTab === "billing" && !isPlatformStaff ? (
          <div className="account-panel-stack">
            {company?.status === "demo" || company?.status === "past_due" || company?.status === "suspended" ? (
              <div className={`account-state-banner status-${company.status}`}>
                <strong>{subscription.tariff}</strong>
                <span>{subscription.note}</span>
              </div>
            ) : null}
            <div className="account-section-grid">
              <article className="card account-card">
                <h2>Текущий тариф</h2>
                <AccountDetailList
                  rows={[
                    { label: "Тариф", value: subscription.tariff },
                    { label: "Статус", value: companyStatusLabel },
                    { label: "Начало периода", value: formatAccountDate(latestSubscription?.startsAt) },
                    {
                      label: "Окончание периода",
                      value: formatAccountDate(
                        company?.subscriptionEndsAt ?? latestSubscription?.endsAt ?? company?.demoEndsAt,
                      ),
                    },
                    { label: "Автопродление", value: <span className="account-muted">Отключено</span> },
                  ]}
                />
                <div className="account-action-list">
                  <button className="button" type="button" disabled>
                    Оплатить / продлить
                  </button>
                  <button className="button secondary" type="button" disabled>
                    Сменить тариф
                  </button>
                  <button className="button secondary" type="button" onClick={openSupport}>
                    Связаться по биллингу
                  </button>
                </div>
              </article>
              <article className="card account-card">
                <h2>Покупки и документы</h2>
                <div className="account-doc-grid">
                  <div>
                    <strong>Покупки компании</strong>
                    <p className="page-subtitle">Появятся после покупки модулей, инструментов или готовых решений.</p>
                  </div>
                  <div>
                    <strong>Финансовые документы</strong>
                    <p className="page-subtitle">Счета, чеки и акты будут доступны после первой оплаты.</p>
                  </div>
                </div>
              </article>
            </div>
            <article className="card account-card">
              <h2>История подписок</h2>
              {billing?.subscriptions?.length ? (
                <div className="account-history-list">
                  {billing.subscriptions.map((item: BillingSubscription) => (
                    <div className="account-history-row" key={item.id}>
                      <div>
                        <strong>{item.plan === "basic" ? "Базовая подписка" : "Расширенная подписка"}</strong>
                        <span>
                          {formatAccountDate(item.startsAt)} — {formatAccountDate(item.endsAt)}
                        </span>
                      </div>
                      <span className="status-pill">{item.status}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="page-subtitle">История появится после активации подписки.</p>
              )}
            </article>
          </div>
        ) : null}

        {activeTab === "security" ? (
          <div className="account-panel-stack">
            <div className="account-section-grid">
              <article className="card account-card">
                <h2>Смена пароля</h2>
                <form className="account-form" onSubmit={onChangePassword}>
                  <label>
                    <span>Текущий пароль</span>
                    <input
                      className="input"
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <label>
                    <span>Новый пароль</span>
                    <input
                      className="input"
                      name="newPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={10}
                      required
                    />
                  </label>
                  <label>
                    <span>Повтор нового пароля</span>
                    <input
                      className="input"
                      name="repeatPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={10}
                      required
                    />
                  </label>
                  {passwordMessage ? <p className="account-form-message">{passwordMessage}</p> : null}
                  <button className="button" type="submit" disabled={passwordSaving}>
                    <KeyRound size={16} />
                    {passwordSaving ? "Сохраняем..." : "Сменить пароль"}
                  </button>
                </form>
              </article>
              <article className="card account-card">
                <h2>Дополнительная защита</h2>
                <div className="account-security-actions">
                  <div>
                    <Smartphone size={20} />
                    <span>Двухфакторная аутентификация по SMS</span>
                  </div>
                  <button className="button secondary" type="button" disabled>
                    Включить
                  </button>
                </div>
                <button className="button secondary" type="button" onClick={logout}>
                  <LogOut size={16} />
                  Завершить эту сессию
                </button>
              </article>
            </div>
            <article className="card account-card">
              <div className="account-card-head">
                <div>
                  <h2>Активные сессии</h2>
                  <p className="page-subtitle">Устройства, с которых сейчас открыт кабинет.</p>
                </div>
                <button
                  className="button secondary danger"
                  onClick={logoutEverywhere}
                  type="button"
                  disabled={sessionBusyId === "all"}
                >
                  Выйти со всех устройств
                </button>
              </div>
              {sessionsState === "loading" ? <p className="page-subtitle">Загружаем сессии...</p> : null}
              <div className="account-session-list">
                {sessions.map((session) => (
                  <div className="account-session-row" key={session.id}>
                    <div>
                      <strong>
                        {describeSessionDevice(session.userAgent)}
                        {session.current ? <span className="status-pill primary">Текущая</span> : null}
                      </strong>
                      <span>
                        IP {session.ipAddress ?? "—"} · последний раз {formatAccountDateTime(session.updatedAt)} · до{" "}
                        {formatAccountDateTime(session.expiresAt)}
                      </span>
                    </div>
                    {!session.current ? (
                      <button
                        className="button secondary"
                        onClick={() => void revokeSession(session.id)}
                        type="button"
                        disabled={sessionBusyId === session.id}
                      >
                        Отозвать
                      </button>
                    ) : null}
                  </div>
                ))}
                {sessionsState !== "loading" && sessions.length === 0 ? (
                  <p className="page-subtitle">Активных сессий не найдено.</p>
                ) : null}
              </div>
            </article>
          </div>
        ) : null}

        {activeTab === "notifications" ? (
          <article className="card account-card">
            <h2>Настройки уведомлений</h2>
            <div className="account-notification-table">
              <div className="account-notification-head">
                <span>Категория</span>
                <span>В кабинете</span>
                <span>Email</span>
              </div>
              {NOTIFICATION_ROWS.filter((row) => !row.companyOnly || !isPlatformStaff).map((row) => (
                <div className="account-notification-row" key={row.category}>
                  <div>
                    <strong>{row.label}</strong>
                    <p>{row.description}</p>
                  </div>
                  {(["in_app", "email"] as const).map((channel) => {
                    const busyKey = `${row.category}:${channel}`;
                    return (
                      <label className="account-toggle" key={channel}>
                        <input
                          checked={notificationEnabled(row.category, channel)}
                          disabled={
                            row.locked || notificationPreferencesState === "loading" || notificationBusyKey === busyKey
                          }
                          onChange={(event) =>
                            void updateNotificationPreference(row.category, channel, event.currentTarget.checked)
                          }
                          type="checkbox"
                        />
                        <span>
                          {row.locked ? "Всегда" : notificationEnabled(row.category, channel) ? "Вкл" : "Выкл"}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
            {notificationPreferencesState === "error" ? (
              <p className="account-form-message">Не удалось загрузить настройки уведомлений.</p>
            ) : null}
          </article>
        ) : null}

        {activeTab === "support" && !isPlatformStaff ? (
          <div className="account-section-grid">
            <article className="card account-card">
              <h2>Поддержка</h2>
              <p className="page-subtitle">Создайте обращение или продолжите переписку с администратором платформы.</p>
              <div className="account-action-list">
                <button className="button" type="button" onClick={openSupport}>
                  <LifeBuoy size={16} />
                  Открыть поддержку
                </button>
              </div>
            </article>
            <article className="card account-card">
              <h2>Последние обращения</h2>
              {supportState === "loading" ? <p className="page-subtitle">Загружаем обращения...</p> : null}
              {supportPreview.length > 0 ? (
                <div className="account-history-list">
                  {supportPreview.map((ticket) => (
                    <button className="account-ticket-row" key={ticket.id} type="button" onClick={openSupport}>
                      <div>
                        <strong>{ticket.subject}</strong>
                        <span>
                          {SUPPORT_CATEGORY_LABELS[ticket.category] ?? ticket.category} ·{" "}
                          {formatAccountDateTime(ticket.updatedAt)}
                        </span>
                      </div>
                      <span className="status-pill">{SUPPORT_STATUS_LABELS[ticket.status] ?? ticket.status}</span>
                    </button>
                  ))}
                </div>
              ) : supportState !== "loading" ? (
                <p className="page-subtitle">Обращений пока нет.</p>
              ) : null}
            </article>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
