"use client";

// Личный кабинет: профиль, безопасность (сессии, смена пароля) и приватность.
// Самый крупный view в проекте — раньше
// жил в DataViews.tsx, теперь изолирован.

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CreditCard,
  Download,
  FileText,
  KeyRound,
  Monitor,
  Pencil,
  RotateCcw,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { BillingStatus, BillingSubscription, CompanyProfileUpdateDto } from "@ecoplatform/shared";
import { MIN_PASSWORD_LENGTH } from "@ecoplatform/shared";
import { AppShell } from "../components/AppShell";
import {
  ACCOUNT_SECTION_CHANGE_EVENT,
  ACCOUNT_SECTION_NAVIGATE_EVENT,
  accountSectionHref,
  isAccountBusinessSection,
  type AccountSectionId,
} from "../components/app-shell-nav";
import { StatusPill, companyStatusPillVariant, subscriptionStatusPillVariant } from "../components/StatusPill";
import { api, clearAccessToken } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  COMPANY_STATUS_LABELS,
  COMPANY_TYPE_LABELS,
  PLATFORM_ROLE_LABELS,
  SUBSCRIPTION_PLAN_TITLE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  USER_GENDER_LABELS,
} from "../lib/display-labels";
import { SUBSCRIPTION_PLAN_TIERS, type SubscriptionPlanTier } from "../lib/subscription-plans";
import { useApiQuery } from "./_shared";
import { accountNotificationRowsForRoles } from "./account-notification-rows";

const PROFILE_PHOTO_HINT =
  "Фото профиля подбирается автоматически по типу компании. Загрузка своего фото появится в следующих обновлениях.";

const ACCOUNT_SETTINGS_SECTIONS: AccountSectionId[] = ["profile", "data-privacy"];
const ACCOUNT_BUSINESS_VIEW_SECTIONS: AccountSectionId[] = [];
const ACCOUNT_SCROLL_OFFSET = 124;

function accountSectionDomId(section: AccountSectionId) {
  return `account-section-${section}`;
}

function dispatchActiveAccountSection(section: AccountSectionId) {
  window.dispatchEvent(new CustomEvent(ACCOUNT_SECTION_CHANGE_EVENT, { detail: { section } }));
}

function scrollAccountSectionIntoView(section: AccountSectionId, behavior: ScrollBehavior = "smooth") {
  const target = document.getElementById(accountSectionDomId(section));
  if (!target) return;

  dispatchActiveAccountSection(section);
  const prefersReducedMotion =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : behavior, block: "start" });
}

// Приветствие по времени суток. Значение по умолчанию ("Добрый день")
// одинаково на сервере и при первом клиентском рендере — гидратация не рвётся,
// а точное приветствие подставляется уже в useEffect после монтирования.
function accountGreeting() {
  const hour = new Date().getHours();
  if (hour < 6) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

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

function AccountEditableValue({ value, label, onEdit }: { value?: string | null; label: string; onEdit?: () => void }) {
  return (
    <span className="account-editable-value">
      <span>{accountDash(value)}</span>
      <button
        aria-label={onEdit ? `Редактировать поле ${label}` : `Редактирование поля ${label} появится позже`}
        className="account-inline-edit"
        disabled={!onEdit}
        onClick={onEdit}
        title={onEdit ? `Редактировать ${label}` : `Редактирование поля ${label} появится позже`}
        type="button"
      >
        <Pencil aria-hidden="true" size={14} />
      </button>
    </span>
  );
}

function AccountPasswordValue({ onEdit }: { onEdit: () => void }) {
  return (
    <span className="account-editable-value">
      <span className="account-secret-value" aria-label="Пароль скрыт">
        ••••••••
      </span>
      <button
        aria-label="Открыть смену пароля"
        className="account-inline-edit"
        onClick={onEdit}
        title="Сменить пароль"
        type="button"
      >
        <Pencil aria-hidden="true" size={14} />
      </button>
    </span>
  );
}

export function AccountView({ section }: { section: AccountSectionId }) {
  const router = useRouter();
  const { user, token, refreshMe } = useAuth();
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
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [sessionsDialogOpen, setSessionsDialogOpen] = useState(false);
  const [notificationsDialogOpen, setNotificationsDialogOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionMessage, setDeletionMessage] = useState<string | null>(null);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [notificationBusyKey, setNotificationBusyKey] = useState<string | null>(null);
  const [greeting, setGreeting] = useState("Добрый день");
  useEffect(() => setGreeting(accountGreeting()), []);
  const [sessionsShown, setSessionsShown] = useState(3);
  const targetSection = isPlatformStaff && isAccountBusinessSection(section) ? "profile" : section;
  const visibleSections = useMemo(
    () =>
      isPlatformStaff ? ACCOUNT_SETTINGS_SECTIONS : [...ACCOUNT_SETTINGS_SECTIONS, ...ACCOUNT_BUSINESS_VIEW_SECTIONS],
    [isPlatformStaff],
  );
  const visibleSectionsKey = visibleSections.join("|");
  // Высота секций зависит от асинхронно подгружаемых данных; включаем все
  // релевантные состояния, чтобы при их догрузке заново «доводить» прокрутку
  // к нужной секции (иначе на прямом заходе по ссылке позиция уезжала).
  const targetLayoutKey = `${billingState}|${sessionsState}|${notificationPreferencesState}`;

  useEffect(() => {
    if (!passwordDialogOpen) return;

    document.body.classList.add("account-password-modal-open");

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !passwordSaving) {
        setPasswordMessage(null);
        setPasswordDialogOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("account-password-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [passwordDialogOpen, passwordSaving]);

  useEffect(() => {
    if (!subscriptionDialogOpen) return;

    document.body.classList.add("account-password-modal-open");

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSubscriptionDialogOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("account-password-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [subscriptionDialogOpen]);

  useEffect(() => {
    if (!paymentDialogOpen) return;

    document.body.classList.add("account-password-modal-open");

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPaymentDialogOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("account-password-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [paymentDialogOpen]);

  useEffect(() => {
    if (!sessionsDialogOpen) return;

    document.body.classList.add("account-password-modal-open");

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSessionsDialogOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("account-password-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sessionsDialogOpen]);

  useEffect(() => {
    if (!notificationsDialogOpen) return;

    document.body.classList.add("account-password-modal-open");

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setNotificationsDialogOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("account-password-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [notificationsDialogOpen]);

  useEffect(() => {
    if (isPlatformStaff && isAccountBusinessSection(section)) {
      router.replace(accountSectionHref("profile"));
    }
  }, [isPlatformStaff, router, section]);

  useEffect(() => {
    const timeouts: number[] = [];
    const frame = window.requestAnimationFrame(() => {
      // На прямом заходе/смене секции — мгновенно (auto): плавную анимацию
      // прерывали ре-рендеры первых сотен мс, и страница оставалась наверху.
      timeouts.push(window.setTimeout(() => scrollAccountSectionIntoView(targetSection, "auto"), 80));
      timeouts.push(window.setTimeout(() => scrollAccountSectionIntoView(targetSection, "auto"), 280));
    });
    return () => {
      window.cancelAnimationFrame(frame);
      for (const timeout of timeouts) {
        window.clearTimeout(timeout);
      }
    };
  }, [targetLayoutKey, targetSection, visibleSectionsKey]);

  useEffect(() => {
    function onNavigate(event: Event) {
      const sectionId = (event as CustomEvent<{ section?: AccountSectionId }>).detail?.section;
      if (!sectionId || !visibleSections.includes(sectionId)) return;
      scrollAccountSectionIntoView(sectionId);
    }

    window.addEventListener(ACCOUNT_SECTION_NAVIGATE_EVENT, onNavigate);
    return () => window.removeEventListener(ACCOUNT_SECTION_NAVIGATE_EVENT, onNavigate);
  }, [visibleSectionsKey, visibleSections]);

  // Scroll-spy: подсветка активной секции в меню при скролле. Раньше на
  // IntersectionObserver — но он «срывался» на первой загрузке (секции ещё не в
  // DOM в момент запуска эффекта) и не перевешивался. Теперь — обычный слушатель
  // скролла: слушатель навешан всегда, а элементы ищем «вживую» при каждом
  // расчёте, поэтому работает сразу после открытия страницы.
  useEffect(() => {
    if (visibleSections.length === 0) return;

    let frame = 0;
    let lastDispatched: AccountSectionId | null = null;

    function computeActive() {
      const offset = ACCOUNT_SCROLL_OFFSET + 12;
      const items = visibleSections
        .map((sectionId) => {
          const element = document.getElementById(accountSectionDomId(sectionId));
          return element ? { sectionId, top: element.getBoundingClientRect().top } : null;
        })
        .filter((item): item is { sectionId: AccountSectionId; top: number } => item !== null);

      const first = items[0];
      if (!first) return;

      const scrollBottom = window.scrollY + window.innerHeight;
      const pageBottom = document.documentElement.scrollHeight;
      let active: AccountSectionId = first.sectionId;

      if (pageBottom - scrollBottom <= 8) {
        // У самого низа страницы — последняя секция (она может не дотянуть до
        // линии активации из-за футера под .page-surface).
        active = (items[items.length - 1] ?? first).sectionId;
      } else {
        for (const item of items) {
          if (item.top <= offset) active = item.sectionId;
        }
      }

      if (active !== lastDispatched) {
        lastDispatched = active;
        dispatchActiveAccountSection(active);
      }
    }

    function onScrollOrResize() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        computeActive();
      });
    }

    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    // Первичный расчёт + повторы: высоты могут «доехать» после монтирования и
    // догрузки данных (billing/sessions), поэтому пересчитываем несколько раз.
    computeActive();
    const t1 = window.setTimeout(computeActive, 200);
    const t2 = window.setTimeout(computeActive, 700);

    return () => {
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
      if (frame) window.cancelAnimationFrame(frame);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [visibleSectionsKey, visibleSections]);

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
  // Демо больше не показываем баннером — его роль выполняет плашка «Текущий
  // план» в секции «Подписка». Баннер оставляем только для проблемных статусов.
  const showBillingStateBanner =
    company?.status === "past_due" || company?.status === "suspended" || company?.status === "pending_deletion";

  // Заполненность профиля — 4 критерия, каждый по 25%. «Способ оплаты» пока
  // всегда false (биллинг-методы не реализованы), при 100% кольцо показывает
  // галочку. Считаем только для клиентских компаний (у сотрудников нет биллинга).
  const profileChecks: Array<{ label: string; done: boolean }> = [
    { label: "Подтверждённая почта", done: Boolean(user?.email) },
    { label: "Указанный телефон", done: Boolean(user?.phone) },
    { label: "Добавлен способ оплаты", done: false },
    {
      label: "Активная подписка",
      done:
        billing?.status === "active" &&
        (billing?.subscriptionPlan === "basic" || billing?.subscriptionPlan === "extended"),
    },
  ];
  const profileCompletion = Math.round(
    (profileChecks.filter((check) => check.done).length / profileChecks.length) * 100,
  );
  const profileComplete = profileCompletion >= 100;
  const currentPlanKey: SubscriptionPlanTier["key"] =
    billing?.status === "active" && billing?.subscriptionPlan === "extended"
      ? "extended"
      : billing?.status === "active" && billing?.subscriptionPlan === "basic"
        ? "basic"
        : "demo";
  const notificationRows = accountNotificationRowsForRoles(user?.platformRoles ?? []);

  function renderBillingStateBanner() {
    if (!showBillingStateBanner || !company) return null;

    return (
      <div className={`account-state-banner status-${company.status}`}>
        <strong>{subscription.tariff}</strong>
        <span>{subscription.note}</span>
      </div>
    );
  }

  function renderCurrentPlanSummary() {
    return (
      <div className="account-plan-current">
        <div className="account-plan-current-main">
          <span className="account-plan-current-icon">
            <CreditCard size={26} />
          </span>
          <div>
            <span className="account-plan-current-label">Текущий план</span>
            <strong className="account-plan-current-name">{subscription.tariff}</strong>
          </div>
        </div>
        <div className="account-plan-current-side">
          {companyStatusLabel ? (
            <StatusPill variant={companyStatusPillVariant(billing?.status)}>{companyStatusLabel}</StatusPill>
          ) : null}
          <span className="account-plan-current-note">{subscription.note}</span>
        </div>
      </div>
    );
  }

  function renderSubscriptionPlans() {
    return (
      <div className="account-plans">
        {SUBSCRIPTION_PLAN_TIERS.map((tier) => {
          const isCurrent = tier.key === currentPlanKey;
          const popular = tier.key === "basic";
          return (
            <article
              className={`account-plan${isCurrent ? " is-current" : ""}${popular ? " is-popular" : ""}`}
              key={tier.key}
            >
              {popular ? <span className="account-plan-badge">Рекомендуем</span> : null}
              <h3 className="account-plan-name">{tier.name}</h3>
              <p className="account-plan-desc">{tier.description}</p>
              <div className="account-plan-price">
                {tier.price ? (
                  <>
                    <span className="account-plan-amount">{tier.price}</span>
                    {tier.pricePeriod ? <span className="account-plan-period">{tier.pricePeriod}</span> : null}
                  </>
                ) : (
                  <span className="account-plan-tbd">Цена скоро</span>
                )}
              </div>
              <ul className="account-plan-features">
                {tier.features.map((feature) => (
                  <li className={feature.included ? undefined : "is-off"} key={feature.label}>
                    <span className={`account-plan-check${feature.included ? "" : " is-off"}`}>
                      {feature.included ? <Check size={12} /> : <X size={12} />}
                    </span>
                    {feature.label}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button className="button secondary" type="button" disabled>
                  Текущий план
                </button>
              ) : (
                <button className={popular ? "button" : "button secondary"} type="button" onClick={openSupport}>
                  Оставить заявку
                </button>
              )}
            </article>
          );
        })}
      </div>
    );
  }

  function renderSubscriptionHistory() {
    return (
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
    );
  }

  function renderPaymentDataCards() {
    return (
      <div className="account-section-grid">
        <article className="card account-card">
          <h2>Способы оплаты</h2>
          <p className="page-subtitle">Сохранённые карты и расчётные счета для безналичной оплаты.</p>
          <div className="account-empty">
            <span className="account-empty-icon">
              <CreditCard size={22} />
            </span>
            <div>
              <strong>
                Пока нет способов оплаты <span className="account-soon">Скоро</span>
              </strong>
              <p>Подписки активируются вручную поддержкой.</p>
            </div>
          </div>
        </article>
        <article className="card account-card">
          <h2>Документы и платежи</h2>
          <p className="page-subtitle">Счета, чеки и акты появятся рядом с каждым платежом.</p>
          <div className="account-empty">
            <span className="account-empty-icon">
              <FileText size={22} />
            </span>
            <div>
              <strong>Документов пока нет</strong>
              <p>Появятся после первой оплаты подписки.</p>
            </div>
          </div>
        </article>
      </div>
    );
  }

  function renderActiveSessionsCard() {
    return (
      <article className="card account-card">
        <div className="account-card-head">
          <div>
            <h2>Активные сессии</h2>
            <p className="page-subtitle">Всего устройств: {sessions.length}</p>
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
          {sessions.slice(0, sessionsShown).map((session) => {
            const mobile = /iPhone|iPad|Android/i.test(session.userAgent ?? "");
            const DeviceIcon = mobile ? Smartphone : Monitor;
            return (
              <div className="account-session-card" key={session.id}>
                <div className="account-session-left">
                  <span className="account-session-ic">
                    <DeviceIcon size={20} />
                  </span>
                  <div className="account-session-meta">
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
                      IP {session.ipAddress ?? "—"} · {formatAccountDateTime(session.updatedAt)} · до{" "}
                      {formatAccountDateTime(session.expiresAt)}
                    </span>
                  </div>
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
            );
          })}
          {sessionsState !== "loading" && sessions.length === 0 ? (
            <p className="page-subtitle">Активных сессий не найдено.</p>
          ) : null}
        </div>
        {sessions.length > sessionsShown ? (
          <button
            className="button secondary account-block-button"
            type="button"
            onClick={() => setSessionsShown((shown) => shown + 5)}
          >
            <ChevronDown size={16} />
            Показать ещё ({sessions.length - sessionsShown})
          </button>
        ) : null}
      </article>
    );
  }

  function renderNotificationPreferencesCard() {
    return (
      <article className="card account-card">
        <div className="account-notification-table">
          <div className="account-notification-head">
            <span>Категория</span>
            <span>В кабинете</span>
          </div>
          {notificationRows.map((row) => {
            const busyKey = `${row.category}:in_app`;
            return (
              <div className="account-notification-row" key={row.category}>
                <div>
                  <strong>{row.label}</strong>
                  <p>{row.description}</p>
                </div>
                <label className="account-switch">
                  <input
                    checked={notificationEnabled(row.category, "in_app")}
                    disabled={notificationPreferencesState === "loading" || notificationBusyKey === busyKey}
                    onChange={(event) =>
                      void updateNotificationPreference(row.category, "in_app", event.currentTarget.checked)
                    }
                    type="checkbox"
                  />
                  <span className="account-switch-track" aria-hidden="true" />
                </label>
              </div>
            );
          })}
        </div>
        {notificationPreferencesState === "loading" ? (
          <p className="page-subtitle">Загружаем настройки уведомлений...</p>
        ) : null}
        {notificationPreferencesState === "error" ? (
          <p className="account-form-message">Не удалось загрузить настройки уведомлений.</p>
        ) : null}
      </article>
    );
  }

  function openSupport() {
    window.dispatchEvent(new Event("support:open"));
  }

  function openSubscriptionDialog() {
    setSubscriptionDialogOpen(true);
  }

  function closeSubscriptionDialog() {
    setSubscriptionDialogOpen(false);
  }

  function openPaymentDialog() {
    setPaymentDialogOpen(true);
  }

  function closePaymentDialog() {
    setPaymentDialogOpen(false);
  }

  function openSessionsDialog() {
    setSessionsDialogOpen(true);
  }

  function closeSessionsDialog() {
    setSessionsDialogOpen(false);
  }

  function openNotificationsDialog() {
    setNotificationsDialogOpen(true);
  }

  function closeNotificationsDialog() {
    setNotificationsDialogOpen(false);
  }

  function openPasswordDialog() {
    setPasswordMessage(null);
    setPasswordDialogOpen(true);
  }

  function closePasswordDialog() {
    if (passwordSaving) return;
    setPasswordMessage(null);
    setPasswordDialogOpen(false);
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
    const muted =
      channel === "in_app"
        ? (notificationPreferences?.inAppMutedCategories ?? [])
        : (notificationPreferences?.emailMutedCategories ?? []);
    return !muted.includes(category);
  }

  async function updateNotificationPreference(category: string, channel: "in_app" | "email", enabled: boolean) {
    if (!token) return;
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
      <section className="page account-scroll-page">
        <AccountScrollSection accountSection="profile">
          {/* Обзор: приветствие, идентификация, кольцо заполнения профиля и
              мини-статистика. Раньше тут был статичный hero с аватаром 128px. */}
          <header className="account-welcome">
            <div className="account-welcome-avatar" title={PROFILE_PHOTO_HINT}>
              {user?.avatarUrl ? (
                <Image alt="" src={user.avatarUrl} width={84} height={84} />
              ) : (
                <span>{initials || "?"}</span>
              )}
            </div>
            <div className="account-welcome-info">
              <span className="account-welcome-hi">{greeting},</span>
              <h1 className="account-welcome-name">{fullName}</h1>
              <div className="account-welcome-tags">
                {isPlatformStaff ? (
                  user?.platformRoles?.map((role) => (
                    <span className="account-welcome-tag" key={role}>
                      {PLATFORM_ROLE_LABELS[role] ?? role}
                    </span>
                  ))
                ) : (
                  <>
                    {company?.organizationName ? (
                      <span className="account-welcome-tag">
                        <span className="account-welcome-dot" aria-hidden="true" />
                        {company.organizationName}
                      </span>
                    ) : null}
                    {company?.type ? (
                      <span className="account-welcome-tag">{COMPANY_TYPE_LABELS[company.type] ?? company.type}</span>
                    ) : null}
                    {companyStatusLabel ? <span className="account-welcome-tag">{companyStatusLabel}</span> : null}
                  </>
                )}
              </div>
            </div>
            {!isPlatformStaff ? (
              <div className="account-welcome-ring" aria-label={`Профиль заполнен на ${profileCompletion}%`}>
                <svg width="96" height="96" viewBox="0 0 96 96" role="img" aria-hidden="true">
                  <circle cx="48" cy="48" r="40" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="9" />
                  <circle
                    className="account-ring-progress"
                    cx="48"
                    cy="48"
                    r="40"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="9"
                    strokeLinecap="round"
                    strokeDasharray={251}
                    strokeDashoffset={Math.round(251 * (1 - profileCompletion / 100))}
                    transform="rotate(-90 48 48)"
                  />
                  {profileComplete ? (
                    <g>
                      <circle cx="48" cy="48" r="20" fill="#ffffff" />
                      <path
                        d="M40 48l6 6 11-12"
                        fill="none"
                        stroke="var(--brand)"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  ) : (
                    <text
                      x="48"
                      y="48"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize="20"
                      fontWeight="800"
                      fill="#ffffff"
                    >
                      {profileCompletion}%
                    </text>
                  )}
                </svg>
                <span className="account-welcome-ring-label">Профиль заполнен</span>
              </div>
            ) : null}
          </header>

          {!isPlatformStaff ? (
            <div className="account-stats">
              <button className="account-stat" type="button" onClick={openSubscriptionDialog}>
                <span className="account-stat-icon account-stat-warn">
                  <CreditCard size={20} />
                </span>
                <span className="account-stat-value">{subscription.tariff}</span>
                <span className="account-stat-label">Подписка</span>
                <ArrowRight className="account-stat-arrow" size={16} aria-hidden="true" />
              </button>
              <button className="account-stat" type="button" onClick={openPaymentDialog}>
                <span className="account-stat-icon account-stat-brand">
                  <FileText size={20} />
                </span>
                <span className="account-stat-value">Платежные данные</span>
                <span className="account-stat-label">Оплата и документы</span>
                <ArrowRight className="account-stat-arrow" size={16} aria-hidden="true" />
              </button>
              <button className="account-stat" type="button" onClick={openSessionsDialog}>
                <span className="account-stat-icon account-stat-info">
                  <Smartphone size={20} />
                </span>
                <span className="account-stat-value">{sessions.length}</span>
                <span className="account-stat-label">Активные сессии</span>
                <ArrowRight className="account-stat-arrow" size={16} aria-hidden="true" />
              </button>
              <button className="account-stat" type="button" onClick={openNotificationsDialog}>
                <span className="account-stat-icon account-stat-green">
                  <Bell size={20} />
                </span>
                <span className="account-stat-value">Вкл</span>
                <span className="account-stat-label">Уведомления</span>
                <ArrowRight className="account-stat-arrow" size={16} aria-hidden="true" />
              </button>
            </div>
          ) : null}

          <div className="account-section-grid">
            <article className="card account-card">
              <h2>Личные данные</h2>
              <AccountDetailList
                rows={[
                  { label: "Имя", value: fullName },
                  { label: "Пол", value: user?.gender ? (USER_GENDER_LABELS[user.gender] ?? user.gender) : null },
                  { label: "Email", value: <AccountEditableValue value={user?.email} label="Email" /> },
                  { label: "Пароль", value: <AccountPasswordValue onEdit={openPasswordDialog} /> },
                  { label: "Телефон", value: <AccountEditableValue value={user?.phone} label="Телефон" /> },
                ]}
              />
            </article>
            {!isPlatformStaff ? (
              billing ? (
                <CompanyProfileForm billing={billing} onSaved={(updated) => setBilling(updated)} />
              ) : (
                <article className="card account-card">
                  <h2>Компания</h2>
                  <p className="page-subtitle">
                    {billingState === "loading"
                      ? "Загружаем реквизиты компании..."
                      : "Данные компании пока недоступны."}
                  </p>
                </article>
              )
            ) : (
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
            )}
          </div>
        </AccountScrollSection>

        <AccountScrollSection
          accountSection="data-privacy"
          description="Экспорт персональных данных и управление удалением аккаунта."
          title="Данные и приватность"
        >
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
        </AccountScrollSection>
      </section>
      {subscriptionDialogOpen ? (
        <div
          aria-labelledby="account-subscription-dialog-title"
          aria-modal="true"
          className="account-password-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeSubscriptionDialog();
          }}
          role="dialog"
        >
          <section className="account-password-modal account-subscription-modal">
            <header className="account-password-modal-head">
              <div>
                <span className="account-password-modal-kicker">Подписка</span>
                <h2 id="account-subscription-dialog-title">Тариф и история</h2>
                <p>Текущий план, доступные тарифы и история подписок.</p>
              </div>
              <button
                aria-label="Закрыть подписку"
                className="account-password-modal-close"
                onClick={closeSubscriptionDialog}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <div className="account-subscription-modal-body account-panel-stack">
              {renderBillingStateBanner()}
              {renderCurrentPlanSummary()}
              {renderSubscriptionPlans()}
              {renderSubscriptionHistory()}
            </div>
          </section>
        </div>
      ) : null}
      {paymentDialogOpen ? (
        <div
          aria-labelledby="account-payment-dialog-title"
          aria-modal="true"
          className="account-password-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePaymentDialog();
          }}
          role="dialog"
        >
          <section className="account-password-modal account-payment-modal">
            <header className="account-password-modal-head">
              <div>
                <span className="account-password-modal-kicker">Оплата</span>
                <h2 id="account-payment-dialog-title">Платежные данные</h2>
                <p>Способы оплаты и платежные документы компании.</p>
              </div>
              <button
                aria-label="Закрыть платежные данные"
                className="account-password-modal-close"
                onClick={closePaymentDialog}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <div className="account-payment-modal-body">{renderPaymentDataCards()}</div>
          </section>
        </div>
      ) : null}
      {sessionsDialogOpen ? (
        <div
          aria-labelledby="account-sessions-dialog-title"
          aria-modal="true"
          className="account-password-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeSessionsDialog();
          }}
          role="dialog"
        >
          <section className="account-password-modal account-sessions-modal">
            <header className="account-password-modal-head">
              <div>
                <span className="account-password-modal-kicker">Доступ</span>
                <h2 id="account-sessions-dialog-title">Сессии</h2>
                <p>Устройства, с которых сейчас открыт кабинет.</p>
              </div>
              <button
                aria-label="Закрыть сессии"
                className="account-password-modal-close"
                onClick={closeSessionsDialog}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <div className="account-sessions-modal-body">{renderActiveSessionsCard()}</div>
          </section>
        </div>
      ) : null}
      {notificationsDialogOpen ? (
        <div
          aria-labelledby="account-notifications-dialog-title"
          aria-modal="true"
          className="account-password-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeNotificationsDialog();
          }}
          role="dialog"
        >
          <section className="account-password-modal account-notifications-modal">
            <header className="account-password-modal-head">
              <div>
                <span className="account-password-modal-kicker">Настройки</span>
                <h2 id="account-notifications-dialog-title">Уведомления</h2>
                <p>Какие уведомления показывать в личном кабинете.</p>
              </div>
              <button
                aria-label="Закрыть уведомления"
                className="account-password-modal-close"
                onClick={closeNotificationsDialog}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <div className="account-notifications-modal-body">{renderNotificationPreferencesCard()}</div>
          </section>
        </div>
      ) : null}
      {passwordDialogOpen ? (
        <div
          aria-labelledby="account-password-dialog-title"
          aria-modal="true"
          className="account-password-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closePasswordDialog();
          }}
          role="dialog"
        >
          <section className="account-password-modal">
            <header className="account-password-modal-head">
              <div>
                <span className="account-password-modal-kicker">Безопасность</span>
                <h2 id="account-password-dialog-title">Смена пароля</h2>
                <p>Введите текущий пароль и новый пароль дважды.</p>
              </div>
              <button
                aria-label="Закрыть смену пароля"
                className="account-password-modal-close"
                disabled={passwordSaving}
                onClick={closePasswordDialog}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form className="account-form account-password-modal-form" onSubmit={onChangePassword}>
              <label>
                <span>Текущий пароль</span>
                <input
                  autoComplete="current-password"
                  autoFocus
                  className="input"
                  name="currentPassword"
                  required
                  type="password"
                />
              </label>
              <label>
                <span>Новый пароль</span>
                <input
                  autoComplete="new-password"
                  className="input"
                  minLength={MIN_PASSWORD_LENGTH}
                  name="newPassword"
                  required
                  type="password"
                />
              </label>
              <label>
                <span>Повтор нового пароля</span>
                <input
                  autoComplete="new-password"
                  className="input"
                  minLength={MIN_PASSWORD_LENGTH}
                  name="repeatPassword"
                  required
                  type="password"
                />
              </label>
              {passwordMessage ? <p className="account-form-message">{passwordMessage}</p> : null}
              <button className="button" type="submit" disabled={passwordSaving}>
                <KeyRound size={16} />
                {passwordSaving ? "Сохраняем..." : "Сменить пароль"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

function AccountScrollSection({
  accountSection,
  children,
  description,
  title,
}: {
  accountSection: AccountSectionId;
  children: ReactNode;
  description?: string;
  title?: string;
}) {
  const titleId = title ? `${accountSectionDomId(accountSection)}-title` : undefined;

  return (
    <section
      className="account-scroll-section"
      data-account-section={accountSection}
      id={accountSectionDomId(accountSection)}
      aria-labelledby={titleId}
    >
      {title ? (
        <header className="account-scroll-section-head">
          <h2 id={titleId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

// ── /account → Компания ─────────────────────────────────────────────────────
// Упрощённый профиль компании (MVP): только базовые поля «Основное» — название,
// сайт, корпоративные телефон и email. PATCH меняет только выбранное поле.
// Тип/статус компании здесь не показываем — ими управляет бэкенд.
type CompanyFormState = {
  organizationName: string;
  websiteUrl: string;
  corporatePhone: string;
  corporateEmail: string;
};

type CompanyEditableField = keyof CompanyFormState;

const COMPANY_FIELD_CONFIG: Record<
  CompanyEditableField,
  {
    detailLabel: string;
    inputLabel: string;
    modalTitle: string;
    placeholder?: string;
    required?: boolean;
    type: "email" | "tel" | "text" | "url";
  }
> = {
  organizationName: {
    detailLabel: "Название",
    inputLabel: "Название организации",
    modalTitle: "Название компании",
    required: true,
    type: "text",
  },
  websiteUrl: {
    detailLabel: "Сайт",
    inputLabel: "Сайт",
    modalTitle: "Сайт компании",
    placeholder: "https://example.ru",
    type: "url",
  },
  corporatePhone: {
    detailLabel: "Телефон",
    inputLabel: "Корпоративный телефон",
    modalTitle: "Корпоративный телефон",
    placeholder: "+74951234567",
    type: "tel",
  },
  corporateEmail: {
    detailLabel: "Email",
    inputLabel: "Корпоративный email",
    modalTitle: "Корпоративный email",
    placeholder: "info@example.ru",
    type: "email",
  },
};

function billingToFormState(billing: BillingStatus): CompanyFormState {
  return {
    organizationName: billing.organizationName,
    websiteUrl: billing.websiteUrl ?? "",
    corporatePhone: billing.corporatePhone ?? "",
    corporateEmail: billing.corporateEmail ?? "",
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
  const [editingField, setEditingField] = useState<CompanyEditableField | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const activeFieldConfig = editingField ? COMPANY_FIELD_CONFIG[editingField] : null;

  // Если внешние данные billing изменились (например, после успешного сейва) —
  // подтянуть форму, чтобы не редактировать «исторические» значения.
  useEffect(() => {
    setForm(billingToFormState(billing));
  }, [billing]);

  function setField<K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    if (!editingField) return;

    document.body.classList.add("account-password-modal-open");

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) {
        setEditingField(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("account-password-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editingField, saving]);

  function openEditDialog(field: CompanyEditableField) {
    setForm(billingToFormState(billing));
    setMessage(null);
    setEditingField(field);
  }

  function closeEditDialog() {
    if (saving) return;
    setEditingField(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingField) return;

    setMessage(null);
    setSaving(true);
    const trimmedValue = form[editingField].trim();
    const dto: CompanyProfileUpdateDto =
      editingField === "organizationName"
        ? { organizationName: trimmedValue }
        : { [editingField]: trimmedValue || null };
    try {
      const updated = await api.billing.updateCompanyProfile(dto);
      onSaved(updated);
      setMessage({ type: "ok", text: "Сохранено." });
      setEditingField(null);
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
    <article className="card account-card">
      <h2>Данные компании</h2>
      <AccountDetailList
        rows={[
          {
            label: COMPANY_FIELD_CONFIG.organizationName.detailLabel,
            value: (
              <AccountEditableValue
                value={billing.organizationName}
                label="Название компании"
                onEdit={() => openEditDialog("organizationName")}
              />
            ),
          },
          {
            label: COMPANY_FIELD_CONFIG.websiteUrl.detailLabel,
            value: (
              <AccountEditableValue
                value={billing.websiteUrl}
                label="Сайт компании"
                onEdit={() => openEditDialog("websiteUrl")}
              />
            ),
          },
          {
            label: COMPANY_FIELD_CONFIG.corporatePhone.detailLabel,
            value: (
              <AccountEditableValue
                value={billing.corporatePhone}
                label="Корпоративный телефон"
                onEdit={() => openEditDialog("corporatePhone")}
              />
            ),
          },
          {
            label: COMPANY_FIELD_CONFIG.corporateEmail.detailLabel,
            value: (
              <AccountEditableValue
                value={billing.corporateEmail}
                label="Корпоративный email"
                onEdit={() => openEditDialog("corporateEmail")}
              />
            ),
          },
        ]}
      />
      {message ? <p className={`account-form-message account-form-message-${message.type}`}>{message.text}</p> : null}
      {editingField && activeFieldConfig ? (
        <div
          aria-labelledby="account-company-dialog-title"
          aria-modal="true"
          className="account-password-modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeEditDialog();
          }}
          role="dialog"
        >
          <section className="account-password-modal">
            <header className="account-password-modal-head">
              <div>
                <span className="account-password-modal-kicker">Компания</span>
                <h2 id="account-company-dialog-title">{activeFieldConfig.modalTitle}</h2>
                <p>Измените только выбранный пункт.</p>
              </div>
              <button
                aria-label={`Закрыть редактирование: ${activeFieldConfig.modalTitle}`}
                className="account-password-modal-close"
                disabled={saving}
                onClick={closeEditDialog}
                type="button"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </header>
            <form className="account-form account-password-modal-form" onSubmit={onSubmit}>
              <label>
                <span>{activeFieldConfig.inputLabel}</span>
                <input
                  autoFocus
                  className="input"
                  onChange={(event: ChangeEvent<HTMLInputElement>) => setField(editingField, event.target.value)}
                  placeholder={activeFieldConfig.placeholder}
                  required={activeFieldConfig.required}
                  type={activeFieldConfig.type}
                  value={form[editingField]}
                />
              </label>
              {message?.type === "error" ? (
                <p className="account-form-message account-form-message-error">{message.text}</p>
              ) : null}
              <button className="button" type="submit" disabled={saving}>
                {saving ? "Сохраняем..." : "Сохранить"}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </article>
  );
}
