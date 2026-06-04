"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { BillingStatus } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import {
  ACCOUNT_SECTION_NAVIGATE_EVENT,
  type AccountProfileModalId,
  accountSectionHref,
  isAccountBusinessSection,
  normalizeAccountProfileModal,
  type AccountSectionId,
} from "../../components/app-shell-nav";
import { api, clearAccessToken } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useApiQuery } from "../shared";
import { accountNotificationRowsForRoles } from "../account-notification-rows";
import { ACCOUNT_BUSINESS_VIEW_SECTIONS, ACCOUNT_SCROLL_OFFSET, ACCOUNT_SETTINGS_SECTIONS } from "./constants";
import { accountSectionDomId, dispatchActiveAccountSection, scrollAccountSectionIntoView } from "./dom";
import { accountGreeting, formatAccountDate } from "./format";
import { AccountProfileSection } from "./AccountProfileSection";
import { DataPrivacySection } from "./DataPrivacySection";
import { NotificationsDialog } from "./NotificationsDialog";
import { PasswordDialog } from "./PasswordDialog";
import { PaymentDialog, SubscriptionDialog } from "./SubscriptionDialog";
import { SessionsDialog } from "./SessionsDialog";
import type { AccountSession, NotificationPreferences } from "./types";

export function AccountView({ section }: { section: AccountSectionId }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawProfileModal = searchParams.get("modal");
  const profileModal = normalizeAccountProfileModal(rawProfileModal);
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
  const notificationRows = accountNotificationRowsForRoles(user?.platformRoles ?? []);

  useEffect(() => {
    if (!rawProfileModal) {
      setSubscriptionDialogOpen(false);
      setSessionsDialogOpen(false);
      setNotificationsDialogOpen(false);
      return;
    }

    if (!user) return;

    if (!profileModal || isPlatformStaff) {
      router.replace(accountSectionHref("profile"), { scroll: false });
      return;
    }

    setSubscriptionDialogOpen(profileModal === "subscription");
    setSessionsDialogOpen(profileModal === "sessions");
    setNotificationsDialogOpen(profileModal === "notifications");
  }, [isPlatformStaff, profileModal, rawProfileModal, router, user]);

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

  function clearProfileModalParam(modal: AccountProfileModalId) {
    if (profileModal === modal) {
      router.replace(accountSectionHref("profile"), { scroll: false });
    }
  }

  function openSupport() {
    window.dispatchEvent(new Event("support:open"));
  }

  function closeSubscriptionDialog() {
    setSubscriptionDialogOpen(false);
    clearProfileModalParam("subscription");
  }

  function closeSessionsDialog() {
    setSessionsDialogOpen(false);
    clearProfileModalParam("sessions");
  }

  function closeNotificationsDialog() {
    setNotificationsDialogOpen(false);
    clearProfileModalParam("notifications");
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
        <AccountProfileSection
          billing={billing}
          billingState={billingState}
          greeting={greeting}
          isPlatformStaff={isPlatformStaff}
          onBillingSaved={(updated) => setBilling(updated)}
          onOpenNotifications={() => setNotificationsDialogOpen(true)}
          onOpenPassword={openPasswordDialog}
          onOpenPayment={() => setPaymentDialogOpen(true)}
          onOpenSessions={() => setSessionsDialogOpen(true)}
          onOpenSubscription={() => setSubscriptionDialogOpen(true)}
          sessionsCount={sessions.length}
          user={user}
        />

        <DataPrivacySection
          deletionBusy={deletionBusy}
          deletionMessage={deletionMessage}
          exportBusy={exportBusy}
          exportMessage={exportMessage}
          onCancelDeletion={() => void cancelDeletion()}
          onExportData={() => void exportData()}
          onRequestDeletion={() => void requestDeletion()}
          user={user}
        />
      </section>
      {subscriptionDialogOpen ? (
        <SubscriptionDialog billing={billing} onClose={closeSubscriptionDialog} onOpenSupport={openSupport} />
      ) : null}
      {paymentDialogOpen ? <PaymentDialog onClose={() => setPaymentDialogOpen(false)} /> : null}
      {sessionsDialogOpen ? (
        <SessionsDialog
          onClose={closeSessionsDialog}
          onLogoutEverywhere={() => void logoutEverywhere()}
          onRevokeSession={revokeSession}
          onShowMore={() => setSessionsShown((shown) => shown + 5)}
          sessionBusyId={sessionBusyId}
          sessions={sessions}
          sessionsShown={sessionsShown}
          sessionsState={sessionsState}
        />
      ) : null}
      {notificationsDialogOpen ? (
        <NotificationsDialog
          notificationBusyKey={notificationBusyKey}
          notificationEnabled={notificationEnabled}
          notificationPreferencesState={notificationPreferencesState}
          notificationRows={notificationRows}
          onClose={closeNotificationsDialog}
          updateNotificationPreference={updateNotificationPreference}
        />
      ) : null}
      {passwordDialogOpen ? (
        <PasswordDialog
          onChangePassword={onChangePassword}
          onClose={closePasswordDialog}
          passwordMessage={passwordMessage}
          passwordSaving={passwordSaving}
        />
      ) : null}
    </AppShell>
  );
}
