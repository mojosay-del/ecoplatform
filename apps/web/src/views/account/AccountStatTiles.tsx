"use client";

import { useRef } from "react";
import { ChevronRight } from "lucide-react";
import type { BillingStatus } from "@ecoplatform/shared";
import type { NavIconKey } from "../../components/app-shell-nav";
import {
  AnimatedNavIcon,
  type AnimatedNavIconHandle,
  useAnimatedNavIconPlayback,
} from "../../components/app-shell/nav-icons";
import type { User } from "../../lib/auth";
import { pluralizeRu } from "../../lib/ru-plural";
import { SUBSCRIPTION_PLAN_TIERS } from "../../lib/subscription-plans";
import { accountNotificationRowsForRoles } from "../account-notification-rows";
import { formatAccountDate } from "./format";
import { currentSubscriptionPlanKey, isActiveTrial } from "./subscription-dialog-utils";
import type { NotificationPreferences } from "./types";
import type { AccountMembersSummary } from "./use-account-members-summary";

type StatTone = "ok" | "info" | "warn" | "danger" | "muted";

type StatStatus = { text: string; tone: StatTone } | "loading";

// Живые статусы плиток кабинета: каждая плитка отвечает на вопрос «что у меня
// там сейчас?» ещё до клика (info scent), а не просто открывает модалку.

function subscriptionStatus(billing: BillingStatus | null, billingState: string): StatStatus {
  if (!billing) return billingState === "loading" ? "loading" : { text: "Нет данных", tone: "muted" };
  if (billing.status === "past_due") return { text: "Оплата просрочена", tone: "warn" };
  if (billing.status === "suspended") return { text: "Приостановлена", tone: "danger" };
  if (billing.status === "pending_deletion") return { text: "Компания удаляется", tone: "danger" };
  const planKey = currentSubscriptionPlanKey(billing);
  if (planKey === "demo") {
    return { text: `Пробный · до ${formatAccountDate(billing.demoEndsAt)}`, tone: "info" };
  }
  if (planKey) {
    const planName = SUBSCRIPTION_PLAN_TIERS.find((tier) => tier.key === planKey)?.name ?? planKey;
    return { text: `${planName} · до ${formatAccountDate(billing.subscriptionEndsAt)}`, tone: "ok" };
  }
  if (isActiveTrial(billing)) return { text: `Пробный · до ${formatAccountDate(billing.demoEndsAt)}`, tone: "info" };
  return { text: "Не активна", tone: "muted" };
}

function sessionsStatus(sessionsCount: number, sessionsState: string): StatStatus {
  if (sessionsState === "loading") return "loading";
  if (sessionsCount <= 0) return { text: "Нет данных", tone: "muted" };
  return {
    text: `${sessionsCount} ${pluralizeRu(sessionsCount, "активная", "активные", "активных")}`,
    tone: "ok",
  };
}

// Сводка по каналу «в кабинете» — только им управляет диалог уведомлений.
function notificationsStatus(
  preferences: NotificationPreferences | null,
  preferencesState: string,
  user: User | null,
): StatStatus {
  if (!preferences) return preferencesState === "loading" ? "loading" : { text: "Нет данных", tone: "muted" };
  const categories = accountNotificationRowsForRoles(user?.platformRoles ?? []).map((row) => row.category);
  const activeCount = categories.filter((category) => !preferences.inAppMutedCategories.includes(category)).length;
  if (activeCount === 0) return { text: "Все выключены", tone: "warn" };
  if (activeCount === categories.length) return { text: "Все категории включены", tone: "ok" };
  return { text: `Включены ${activeCount} из ${categories.length}`, tone: "info" };
}

function privacyStatus(user: User | null): StatStatus {
  if (user?.deletionRequestedAt) {
    return { text: `Удаление ${formatAccountDate(user.deletionScheduledFor)}`, tone: "danger" };
  }
  return { text: "Экспорт и удаление данных", tone: "muted" };
}

function membersStatus(summary: AccountMembersSummary | null, state: string): StatStatus {
  if (state === "loading" || state === "idle") return "loading";
  if (!summary) return { text: "Команда компании", tone: "muted" };
  const membersPart = `${summary.membersCount} ${pluralizeRu(summary.membersCount, "участник", "участника", "участников")}`;
  if (summary.pendingInvites > 0) {
    const invitesPart = `${summary.pendingInvites} ${pluralizeRu(
      summary.pendingInvites,
      "приглашение",
      "приглашения",
      "приглашений",
    )}`;
    return { text: `${membersPart} · ${invitesPart}`, tone: "info" };
  }
  return { text: membersPart, tone: "ok" };
}

export function AccountStatTiles({
  billing,
  billingState,
  membersSummary,
  membersSummaryState,
  notificationPreferences,
  notificationPreferencesState,
  onOpenDataPrivacy,
  onOpenMembers,
  onOpenNotifications,
  onOpenPayment,
  onOpenSessions,
  onOpenSubscription,
  sessionsCount,
  sessionsState,
  user,
}: {
  billing: BillingStatus | null;
  billingState: string;
  membersSummary: AccountMembersSummary | null;
  membersSummaryState: string;
  notificationPreferences: NotificationPreferences | null;
  notificationPreferencesState: string;
  onOpenDataPrivacy: () => void;
  onOpenMembers: () => void;
  onOpenNotifications: () => void;
  onOpenPayment: () => void;
  onOpenSessions: () => void;
  onOpenSubscription: () => void;
  sessionsCount: number;
  sessionsState: string;
  user: User | null;
}) {
  const isOwner = user?.companyRole === "owner";

  return (
    <div className="account-stats" data-tour="account-tiles">
      <AccountStatTile
        iconClassName="account-stat-warn"
        iconName="subscription"
        label="Подписка"
        onClick={onOpenSubscription}
        status={subscriptionStatus(billing, billingState)}
      />
      <AccountStatTile
        badge="Скоро"
        iconClassName="account-stat-brand"
        iconName="docs"
        label="Оплата"
        onClick={onOpenPayment}
        status={{ text: "Способы и документы", tone: "muted" }}
      />
      <AccountStatTile
        iconClassName="account-stat-info"
        iconName="sessions"
        label="Сессии"
        onClick={onOpenSessions}
        status={sessionsStatus(sessionsCount, sessionsState)}
      />
      <AccountStatTile
        iconClassName="account-stat-green"
        iconName="notifications"
        label="Уведомления"
        onClick={onOpenNotifications}
        status={notificationsStatus(notificationPreferences, notificationPreferencesState, user)}
      />
      <AccountStatTile
        ariaLabel="Открыть данные и приватность"
        iconClassName="account-stat-privacy"
        iconName="data-privacy"
        label="Приватность"
        onClick={onOpenDataPrivacy}
        status={privacyStatus(user)}
      />
      {/* Управление сотрудниками — только владельцу компании. */}
      {isOwner ? (
        <AccountStatTile
          ariaLabel="Открыть сотрудников"
          iconClassName="account-stat-info"
          iconName="employees"
          label="Сотрудники"
          onClick={onOpenMembers}
          status={membersStatus(membersSummary, membersSummaryState)}
        />
      ) : null}
    </div>
  );
}

function AccountStatTile({
  ariaLabel,
  badge,
  iconClassName,
  iconName,
  label,
  onClick,
  status,
}: {
  ariaLabel?: string;
  badge?: string;
  iconClassName: string;
  iconName: NavIconKey;
  label: string;
  onClick: () => void;
  status: StatStatus;
}) {
  const iconRef = useRef<AnimatedNavIconHandle | null>(null);
  const iconPlayback = useAnimatedNavIconPlayback(iconRef);

  return (
    <button aria-label={ariaLabel} className="account-stat" type="button" onClick={onClick} {...iconPlayback}>
      <span className={`account-stat-icon ${iconClassName}`}>
        <AnimatedNavIcon name={iconName} ref={iconRef} size={24} />
      </span>
      <span className="account-stat-body">
        <span className="account-stat-title">
          {label}
          {badge ? <span className="account-stat-badge">{badge}</span> : null}
        </span>
        {status === "loading" ? (
          <span aria-hidden="true" className="account-stat-status-skeleton" />
        ) : (
          <span className={`account-stat-status is-${status.tone}`}>
            <span aria-hidden="true" className="account-stat-dot" />
            {status.text}
          </span>
        )}
      </span>
      <ChevronRight aria-hidden="true" className="account-stat-chevron" size={16} />
    </button>
  );
}
