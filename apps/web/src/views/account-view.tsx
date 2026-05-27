"use client";

// Личный кабинет: профиль, безопасность (сессии, смена пароля), уведомления,
// биллинг и список тикетов поддержки. Самый крупный view в проекте — раньше
// жил в DataViews.tsx, теперь изолирован.

import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Download, KeyRound, LifeBuoy, LogOut, RotateCcw, Smartphone, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  AddressDto,
  BillingStatus,
  BillingSubscription,
  CompanyProfileUpdateDto,
  PaginatedResponse,
} from "@ecoplatform/shared";
import { MIN_PASSWORD_LENGTH } from "@ecoplatform/shared";
import { AppShell } from "../components/AppShell";
import { accountSectionHref, isAccountBusinessSection, type AccountSectionId } from "../components/app-shell-nav";
import {
  StatusPill,
  companyStatusPillVariant,
  subscriptionStatusPillVariant,
  supportStatusPillVariant,
} from "../components/StatusPill";
import { api, clearAccessToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  COMPANY_STATUS_LABELS,
  COMPANY_TYPE_LABELS,
  PLATFORM_ROLE_LABELS,
  SUBSCRIPTION_PLAN_TITLE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_STATUS_LABELS,
  USER_GENDER_LABELS,
} from "../lib/display-labels";
import { useApiQuery } from "./_shared";

const PROFILE_PHOTO_HINT =
  "Фото профиля подбирается автоматически по типу компании. Загрузка своего фото появится в следующих обновлениях.";

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
      tariff: SUBSCRIPTION_PLAN_TITLE_LABELS[billing.subscriptionPlan] ?? billing.subscriptionPlan,
      note: endsAt ? `Действует до ${endsAt.toLocaleString("ru-RU")}` : "Подписка активна",
    };
  }
  if (billing.status === "past_due")
    return { tariff: "Подписка просрочена", note: "Свяжитесь с поддержкой для продления." };
  if (billing.status === "suspended") return { tariff: "Приостановлена", note: "Доступ к разделам временно закрыт." };
  if (billing.status === "pending_deletion")
    return { tariff: "Удаление запланировано", note: "Доступ к функциональным разделам закрыт до отмены запроса." };
  if (billing.status === "blocked") return { tariff: "Заблокирована", note: "Компания заблокирована." };
  return { tariff: "не активирован", note: "Подписка не активна" };
}

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

export function AccountView({ section }: { section: AccountSectionId }) {
  const router = useRouter();
  const { user, token, logout, refreshMe } = useAuth();
  const isPlatformStaff = (user?.platformRoles?.length ?? 0) > 0;
  const {
    data: billing,
    setData: setBilling,
    state: billingState,
  } = useApiQuery<BillingStatus | null>(isPlatformStaff ? null : "billing-status", () => api.billing.status(), null);
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
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionMessage, setDeletionMessage] = useState<string | null>(null);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [notificationBusyKey, setNotificationBusyKey] = useState<string | null>(null);
  const activeSection = isPlatformStaff && isAccountBusinessSection(section) ? "profile" : section;

  useEffect(() => {
    if (isPlatformStaff && isAccountBusinessSection(section)) {
      router.replace(accountSectionHref("profile"));
    }
  }, [isPlatformStaff, router, section]);

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
  const showBillingStateBanner =
    company?.status === "demo" ||
    company?.status === "past_due" ||
    company?.status === "suspended" ||
    company?.status === "pending_deletion";

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

  async function exportData() {
    if (!token) return;
    setExportBusy(true);
    setExportMessage(null);
    try {
      const { blob, filename } = await api.auth.exportData();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename ?? "ecoplatform-data-export.zip";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportMessage("Архив с данными подготовлен.");
      window.dispatchEvent(new Event("notifications:changed"));
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Не удалось подготовить экспорт.");
    } finally {
      setExportBusy(false);
    }
  }

  async function requestDeletion() {
    if (!token) return;
    const ok = window.confirm(
      "Запланировать удаление аккаунта через 30 дней? Функциональные разделы будут закрыты до отмены запроса.",
    );
    if (!ok) return;
    setDeletionBusy(true);
    setDeletionMessage(null);
    try {
      const result = await api.auth.requestDeletion();
      await refreshMe();
      setDeletionMessage(
        `Удаление запланировано на ${formatAccountDate(result.deletionScheduledFor)}. Можно отменить до этой даты.`,
      );
      window.dispatchEvent(new Event("notifications:changed"));
    } catch (error) {
      setDeletionMessage(error instanceof Error ? error.message : "Не удалось запланировать удаление.");
    } finally {
      setDeletionBusy(false);
    }
  }

  async function cancelDeletion() {
    if (!token) return;
    setDeletionBusy(true);
    setDeletionMessage(null);
    try {
      await api.auth.cancelDeletion();
      await refreshMe();
      setDeletionMessage("Запрос на удаление отменён.");
      window.dispatchEvent(new Event("notifications:changed"));
    } catch (error) {
      setDeletionMessage(error instanceof Error ? error.message : "Не удалось отменить удаление.");
    } finally {
      setDeletionBusy(false);
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
            <div className="account-hero-avatar" aria-hidden={!user?.avatarUrl} title={PROFILE_PHOTO_HINT}>
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
              {user?.gender ? <StatusPill>{USER_GENDER_LABELS[user.gender] ?? user.gender}</StatusPill> : null}
              {isPlatformStaff
                ? user?.platformRoles?.map((role) => (
                    <StatusPill key={role} variant="brand">
                      {PLATFORM_ROLE_LABELS[role] ?? role}
                    </StatusPill>
                  ))
                : null}
              {companyStatusLabel && !isPlatformStaff ? (
                <StatusPill variant={companyStatusPillVariant(billing?.status)}>{companyStatusLabel}</StatusPill>
              ) : null}
              {billing?.status === "demo" && !isPlatformStaff ? (
                <Link className="account-hero-cta" href={accountSectionHref("billing")}>
                  Активировать подписку
                </Link>
              ) : null}
            </div>
          </div>
        </header>

        {activeSection === "profile" ? (
          <div className="account-section-grid">
            <article className="card account-card">
              <h2>Пользователь</h2>
              <AccountDetailList
                rows={[
                  { label: "Имя", value: fullName },
                  { label: "Email", value: user?.email },
                  { label: "Телефон", value: user?.phone },
                  { label: "Статус", value: <StatusPill variant="success">Активен</StatusPill> },
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
                    <StatusPill key={role} variant="brand">
                      {PLATFORM_ROLE_LABELS[role] ?? role}
                    </StatusPill>
                  ))}
                </div>
              </article>
            ) : null}
          </div>
        ) : null}

        {activeSection === "company" && !isPlatformStaff ? (
          billing ? (
            <CompanyProfileForm billing={billing} onSaved={(updated) => setBilling(updated)} />
          ) : (
            <article className="card account-card">
              <h2>Компания</h2>
              <p className="page-subtitle">
                {billingState === "loading" ? "Загружаем реквизиты компании..." : "Данные компании пока недоступны."}
              </p>
            </article>
          )
        ) : null}

        {activeSection === "billing" && !isPlatformStaff ? (
          <div className="account-panel-stack">
            {showBillingStateBanner ? (
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
                        <strong>{SUBSCRIPTION_PLAN_TITLE_LABELS[item.plan] ?? item.plan}</strong>
                        <span>
                          {formatAccountDate(item.startsAt)} — {formatAccountDate(item.endsAt)}
                        </span>
                      </div>
                      <StatusPill variant={subscriptionStatusPillVariant(item.status)}>
                        {SUBSCRIPTION_STATUS_LABELS[item.status] ?? item.status}
                      </StatusPill>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="page-subtitle">История появится после активации подписки.</p>
              )}
            </article>
            <div className="account-section-grid">
              <article className="card account-card">
                <h2>Способы оплаты</h2>
                <p className="page-subtitle">
                  Здесь появятся сохранённые карты и реквизиты для безналичной оплаты. Подключим в ближайшем обновлении
                  — пока подписки активируются вручную поддержкой.
                </p>
                <div className="account-action-list">
                  <button className="button secondary" type="button" disabled>
                    Добавить карту
                  </button>
                  <button className="button secondary" type="button" disabled>
                    Добавить расчётный счёт
                  </button>
                </div>
              </article>
              <article className="card account-card">
                <h2>История платежей</h2>
                <p className="page-subtitle">
                  Платежи появятся здесь после оплаты подписки или покупок в магазине. Чек и счёт-фактуру можно будет
                  скачать рядом с каждой записью.
                </p>
              </article>
            </div>
          </div>
        ) : null}

        {activeSection === "security" ? (
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
                      minLength={MIN_PASSWORD_LENGTH}
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
                      minLength={MIN_PASSWORD_LENGTH}
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
          </div>
        ) : null}

        {activeSection === "data-privacy" ? (
          <div className="account-section-grid">
            <article className="card account-card">
              <h2>Мои данные</h2>
              <p className="page-subtitle">
                Архив включает профиль, согласия, сессии, уведомления, обращения и данные компании.
              </p>
              {exportMessage ? <p className="account-form-message">{exportMessage}</p> : null}
              <button className="button secondary" type="button" onClick={exportData} disabled={exportBusy}>
                <Download size={16} />
                {exportBusy ? "Готовим..." : "Скачать архив"}
              </button>
            </article>
            <article className="card account-card account-danger-zone">
              <h2>Опасная зона</h2>
              {user?.deletionRequestedAt ? (
                <p className="page-subtitle">
                  Удаление аккаунта запланировано на {formatAccountDate(user.deletionScheduledFor)}. До этой даты запрос
                  можно отменить.
                </p>
              ) : (
                <p className="page-subtitle">
                  Запрос ставит аккаунт в очередь удаления на 30 дней и закрывает функциональные разделы компании.
                </p>
              )}
              {deletionMessage ? <p className="account-form-message">{deletionMessage}</p> : null}
              {user?.deletionRequestedAt ? (
                <button className="button secondary" type="button" onClick={cancelDeletion} disabled={deletionBusy}>
                  <RotateCcw size={16} />
                  {deletionBusy ? "Отменяем..." : "Передумал"}
                </button>
              ) : (
                <button
                  className="button secondary danger"
                  type="button"
                  onClick={requestDeletion}
                  disabled={deletionBusy}
                >
                  <Trash2 size={16} />
                  {deletionBusy ? "Планируем..." : "Запросить удаление"}
                </button>
              )}
            </article>
          </div>
        ) : null}

        {activeSection === "sessions" ? (
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
                      {session.current ? (
                        <>
                          {" "}
                          <StatusPill variant="brand">Текущая</StatusPill>
                        </>
                      ) : null}
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
        ) : null}

        {activeSection === "notifications" ? (
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

        {activeSection === "support" && !isPlatformStaff ? (
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
                      <StatusPill variant={supportStatusPillVariant(ticket.status)}>
                        {SUPPORT_STATUS_LABELS[ticket.status] ?? ticket.status}
                      </StatusPill>
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

// ── /account → Компания (Волна 7.4) ─────────────────────────────────────────
// Редактируемый профиль компании: 4 секции (Основное / Контакты / Адреса /
// Реквизиты). Один Save-кнопка внизу — собирает все изменённые поля и
// отправляет одним PATCH. Поля type/status/createdAt — read-only (управляются
// бэком), остальное — текстовые input'ы с inline-валидацией от бэка.
type AddressFormState = {
  country: string;
  region: string;
  city: string;
  street: string;
  building: string;
  apartment: string;
  postcode: string;
};

type CompanyFormState = {
  organizationName: string;
  websiteUrl: string;
  corporatePhone: string;
  corporateEmail: string;
  about: string;
  contactPersonName: string;
  contactPersonPhone: string;
  contactPersonEmail: string;
  billingInn: string;
  billingKpp: string;
  bankName: string;
  bankBik: string;
  bankAccount: string;
  correspondentAccount: string;
  factualAddress: AddressFormState;
  structuredLegalAddress: AddressFormState;
};

function emptyAddress(): AddressFormState {
  return { country: "Россия", region: "", city: "", street: "", building: "", apartment: "", postcode: "" };
}

function addressFromBilling(address: BillingStatus["factualAddress"]): AddressFormState {
  if (!address) return emptyAddress();
  return {
    country: address.country ?? "Россия",
    region: address.region ?? "",
    city: address.city ?? "",
    street: address.street ?? "",
    building: address.building ?? "",
    apartment: address.apartment ?? "",
    postcode: address.postcode ?? "",
  };
}

function billingToFormState(billing: BillingStatus): CompanyFormState {
  return {
    organizationName: billing.organizationName,
    websiteUrl: billing.websiteUrl ?? "",
    corporatePhone: billing.corporatePhone ?? "",
    corporateEmail: billing.corporateEmail ?? "",
    about: billing.about ?? "",
    contactPersonName: billing.contactPersonName ?? "",
    contactPersonPhone: billing.contactPersonPhone ?? "",
    contactPersonEmail: billing.contactPersonEmail ?? "",
    billingInn: billing.billingInn ?? "",
    billingKpp: billing.billingKpp ?? "",
    bankName: billing.bankName ?? "",
    bankBik: billing.bankBik ?? "",
    bankAccount: billing.bankAccount ?? "",
    correspondentAccount: billing.correspondentAccount ?? "",
    factualAddress: addressFromBilling(billing.factualAddress),
    structuredLegalAddress: addressFromBilling(billing.structuredLegalAddress),
  };
}

// Адрес считаем заполненным, если указан город. Не передаём бэку пустой адрес
// (Zod-схема требует city.min(1)) — отправляем null = «отвязать».
function addressToDto(address: AddressFormState): AddressDto | null {
  if (!address.city.trim()) return null;
  return {
    country: address.country.trim() || "Россия",
    region: address.region.trim() || null,
    city: address.city.trim(),
    street: address.street.trim() || null,
    building: address.building.trim() || null,
    apartment: address.apartment.trim() || null,
    postcode: address.postcode.trim() || null,
    formatted: null,
  };
}

function CompanyProfileForm({
  billing,
  onSaved,
}: {
  billing: BillingStatus;
  onSaved: (updated: BillingStatus) => void;
}) {
  const [form, setForm] = useState<CompanyFormState>(() => billingToFormState(billing));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  // Если внешние данные billing изменились (например, после успешного сейва) —
  // подтянуть форму, чтобы не редактировать «исторические» значения.
  useEffect(() => {
    setForm(billingToFormState(billing));
  }, [billing]);

  function setField<K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setAddressField(
    section: "factualAddress" | "structuredLegalAddress",
    key: keyof AddressFormState,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      [section]: { ...current[section], [key]: value },
    }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setSaving(true);
    const dto: CompanyProfileUpdateDto = {
      organizationName: form.organizationName.trim() || undefined,
      websiteUrl: form.websiteUrl.trim() || null,
      corporatePhone: form.corporatePhone.trim() || null,
      corporateEmail: form.corporateEmail.trim() || null,
      about: form.about.trim() || null,
      contactPersonName: form.contactPersonName.trim() || null,
      contactPersonPhone: form.contactPersonPhone.trim() || null,
      contactPersonEmail: form.contactPersonEmail.trim() || null,
      billingInn: form.billingInn.trim() || null,
      billingKpp: form.billingKpp.trim() || null,
      bankName: form.bankName.trim() || null,
      bankBik: form.bankBik.trim() || null,
      bankAccount: form.bankAccount.trim() || null,
      correspondentAccount: form.correspondentAccount.trim() || null,
      factualAddress: addressToDto(form.factualAddress),
      structuredLegalAddress: addressToDto(form.structuredLegalAddress),
    };
    try {
      const updated = await api.billing.updateCompanyProfile(dto);
      onSaved(updated);
      setMessage({ type: "ok", text: "Сохранено." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Не удалось сохранить.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="account-panel-stack" onSubmit={onSubmit}>
      <div className="account-section-grid">
        <article className="card account-card">
          <h2>Основное</h2>
          <label className="account-form-field">
            <span>Название компании</span>
            <input
              className="input"
              type="text"
              value={form.organizationName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setField("organizationName", event.target.value)}
              required
            />
          </label>
          <AccountDetailList
            rows={[
              {
                label: "Тип",
                value: billing.type ? (COMPANY_TYPE_LABELS[billing.type] ?? billing.type) : null,
              },
              {
                label: "Статус",
                value: billing.status ? (
                  <StatusPill variant={companyStatusPillVariant(billing.status)}>
                    {COMPANY_STATUS_LABELS[billing.status] ?? billing.status}
                  </StatusPill>
                ) : null,
              },
            ]}
          />
          <label className="account-form-field">
            <span>О компании</span>
            <textarea
              className="input"
              rows={4}
              maxLength={2000}
              value={form.about}
              onChange={(event) => setField("about", event.target.value)}
              placeholder="Несколько предложений о вашей компании — для коллег, партнёров и админов"
            />
          </label>
        </article>

        <article className="card account-card">
          <h2>Контакты</h2>
          <label className="account-form-field">
            <span>Сайт</span>
            <input
              className="input"
              type="url"
              value={form.websiteUrl}
              onChange={(event) => setField("websiteUrl", event.target.value)}
              placeholder="https://example.ru"
            />
          </label>
          <label className="account-form-field">
            <span>Корпоративный телефон</span>
            <input
              className="input"
              type="tel"
              value={form.corporatePhone}
              onChange={(event) => setField("corporatePhone", event.target.value)}
              placeholder="+74951234567"
            />
          </label>
          <label className="account-form-field">
            <span>Корпоративный email</span>
            <input
              className="input"
              type="email"
              value={form.corporateEmail}
              onChange={(event) => setField("corporateEmail", event.target.value)}
              placeholder="info@example.ru"
            />
          </label>
          <h3 className="account-form-subhead">Контактное лицо</h3>
          <label className="account-form-field">
            <span>ФИО</span>
            <input
              className="input"
              type="text"
              value={form.contactPersonName}
              onChange={(event) => setField("contactPersonName", event.target.value)}
              placeholder="Иван Петров"
            />
          </label>
          <label className="account-form-field">
            <span>Телефон</span>
            <input
              className="input"
              type="tel"
              value={form.contactPersonPhone}
              onChange={(event) => setField("contactPersonPhone", event.target.value)}
              placeholder="+79161112233"
            />
          </label>
          <label className="account-form-field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              value={form.contactPersonEmail}
              onChange={(event) => setField("contactPersonEmail", event.target.value)}
              placeholder="ivan@example.ru"
            />
          </label>
        </article>
      </div>

      <div className="account-section-grid">
        <article className="card account-card">
          <h2>Фактический адрес</h2>
          <AddressFields
            address={form.factualAddress}
            onChange={(key, value) => setAddressField("factualAddress", key, value)}
          />
        </article>

        <article className="card account-card">
          <h2>Юридический адрес</h2>
          <AddressFields
            address={form.structuredLegalAddress}
            onChange={(key, value) => setAddressField("structuredLegalAddress", key, value)}
          />
          <p className="page-subtitle">
            Этот адрес уходит в счета, акты и договоры. Если совпадает с фактическим — продублируйте.
          </p>
        </article>
      </div>

      <article className="card account-card">
        <h2>Банковские реквизиты</h2>
        <div className="account-form-grid-2">
          <label className="account-form-field">
            <span>ИНН</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={form.billingInn}
              onChange={(event) => setField("billingInn", event.target.value)}
              placeholder="7707083893"
              maxLength={12}
            />
          </label>
          <label className="account-form-field">
            <span>КПП</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={form.billingKpp}
              onChange={(event) => setField("billingKpp", event.target.value)}
              placeholder="770701001"
              maxLength={9}
            />
          </label>
          <label className="account-form-field account-form-field-wide">
            <span>Банк</span>
            <input
              className="input"
              type="text"
              value={form.bankName}
              onChange={(event) => setField("bankName", event.target.value)}
              placeholder="ПАО Сбербанк"
            />
          </label>
          <label className="account-form-field">
            <span>БИК</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={form.bankBik}
              onChange={(event) => setField("bankBik", event.target.value)}
              placeholder="044525225"
              maxLength={9}
            />
          </label>
          <label className="account-form-field account-form-field-wide">
            <span>Расчётный счёт</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={form.bankAccount}
              onChange={(event) => setField("bankAccount", event.target.value)}
              placeholder="40702810500000000123"
              maxLength={20}
            />
          </label>
          <label className="account-form-field account-form-field-wide">
            <span>Корреспондентский счёт</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              value={form.correspondentAccount}
              onChange={(event) => setField("correspondentAccount", event.target.value)}
              placeholder="30101810400000000225"
              maxLength={20}
            />
          </label>
        </div>
      </article>

      {message ? <p className={`account-form-message account-form-message-${message.type}`}>{message.text}</p> : null}

      <div className="account-action-list">
        <button className="button" type="submit" disabled={saving}>
          {saving ? "Сохраняем..." : "Сохранить изменения"}
        </button>
      </div>
    </form>
  );
}

function AddressFields({
  address,
  onChange,
}: {
  address: AddressFormState;
  onChange: (key: keyof AddressFormState, value: string) => void;
}) {
  return (
    <div className="account-form-grid-2">
      <label className="account-form-field account-form-field-wide">
        <span>Город *</span>
        <input
          className="input"
          type="text"
          value={address.city}
          onChange={(event) => onChange("city", event.target.value)}
          placeholder="Москва"
        />
      </label>
      <label className="account-form-field">
        <span>Индекс</span>
        <input
          className="input"
          type="text"
          inputMode="numeric"
          value={address.postcode}
          onChange={(event) => onChange("postcode", event.target.value)}
          placeholder="101000"
          maxLength={6}
        />
      </label>
      <label className="account-form-field">
        <span>Регион</span>
        <input
          className="input"
          type="text"
          value={address.region}
          onChange={(event) => onChange("region", event.target.value)}
          placeholder="Московская область"
        />
      </label>
      <label className="account-form-field account-form-field-wide">
        <span>Улица</span>
        <input
          className="input"
          type="text"
          value={address.street}
          onChange={(event) => onChange("street", event.target.value)}
          placeholder="Ленина"
        />
      </label>
      <label className="account-form-field">
        <span>Дом</span>
        <input
          className="input"
          type="text"
          value={address.building}
          onChange={(event) => onChange("building", event.target.value)}
          placeholder="12"
        />
      </label>
      <label className="account-form-field">
        <span>Кв./офис</span>
        <input
          className="input"
          type="text"
          value={address.apartment}
          onChange={(event) => onChange("apartment", event.target.value)}
          placeholder="5"
        />
      </label>
    </div>
  );
}
