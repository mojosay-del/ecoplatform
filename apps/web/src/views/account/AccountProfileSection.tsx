"use client";

import { motion, useReducedMotion } from "motion/react";
import type { BillingStatus } from "@ecoplatform/shared";
import type { User } from "../../lib/auth";
import { accountBlock } from "./account-motion";
import { AccountDetailList, AccountPasswordValue, AccountScrollSection } from "./shared";
import { AccountStatTiles } from "./AccountStatTiles";
import { AccountWelcomeHero } from "./AccountWelcomeHero";
import { CompanyProfileForm } from "./CompanyProfileForm";
import { AccountContactValue, AccountGenderValue, AccountNameValue } from "./PersonalProfileFields";
import type { NotificationPreferences } from "./types";
import type { AccountMembersSummary } from "./use-account-members-summary";

export function AccountProfileSection({
  billing,
  billingState,
  greeting,
  isPlatformStaff,
  membersSummary,
  membersSummaryState,
  notificationPreferences,
  notificationPreferencesState,
  onBillingSaved,
  onOpenDataPrivacy,
  onOpenMembers,
  onOpenNotifications,
  onOpenPassword,
  onOpenPayment,
  onOpenSessions,
  onOpenSubscription,
  onProfileSaved,
  sessionsCount,
  sessionsState,
  user,
}: {
  billing: BillingStatus | null;
  billingState: string;
  greeting: string;
  isPlatformStaff: boolean;
  membersSummary: AccountMembersSummary | null;
  membersSummaryState: string;
  notificationPreferences: NotificationPreferences | null;
  notificationPreferencesState: string;
  onBillingSaved: (updated: BillingStatus) => void;
  onOpenDataPrivacy: () => void;
  onOpenMembers: () => void;
  onOpenNotifications: () => void;
  onOpenPassword: () => void;
  onOpenPayment: () => void;
  onOpenSessions: () => void;
  onOpenSubscription: () => void;
  onProfileSaved: () => Promise<void>;
  sessionsCount: number;
  sessionsState: string;
  user: User | null;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <AccountScrollSection accountSection="profile">
      <AccountWelcomeHero
        billing={billing}
        greeting={greeting}
        isPlatformStaff={isPlatformStaff}
        onOpenSubscription={onOpenSubscription}
        user={user}
      />

      {!isPlatformStaff ? (
        <motion.div animate="visible" initial={reducedMotion ? false : "hidden"} variants={accountBlock(0.12)}>
          <AccountStatTiles
            billing={billing}
            billingState={billingState}
            membersSummary={membersSummary}
            membersSummaryState={membersSummaryState}
            notificationPreferences={notificationPreferences}
            notificationPreferencesState={notificationPreferencesState}
            onOpenDataPrivacy={onOpenDataPrivacy}
            onOpenMembers={onOpenMembers}
            onOpenNotifications={onOpenNotifications}
            onOpenPayment={onOpenPayment}
            onOpenSessions={onOpenSessions}
            onOpenSubscription={onOpenSubscription}
            sessionsCount={sessionsCount}
            sessionsState={sessionsState}
            user={user}
          />
        </motion.div>
      ) : null}

      <motion.div
        animate="visible"
        className="account-section-grid"
        data-tour="account-cards"
        initial={reducedMotion ? false : "hidden"}
        variants={accountBlock(0.2)}
      >
        <article className="card account-card">
          <h2>Личные данные</h2>
          <AccountDetailList
            rows={[
              { label: "Имя и фамилия", value: <AccountNameValue user={user} onSaved={onProfileSaved} /> },
              { label: "Пол", value: <AccountGenderValue value={user?.gender ?? null} onSaved={onProfileSaved} /> },
              {
                label: "Email",
                value: <AccountContactValue field="email" value={user?.email} label="Email" onSaved={onProfileSaved} />,
              },
              { label: "Пароль", value: <AccountPasswordValue onEdit={onOpenPassword} /> },
              {
                label: "Телефон",
                value: (
                  <AccountContactValue field="phone" value={user?.phone} label="Телефон" onSaved={onProfileSaved} />
                ),
              },
            ]}
          />
        </article>
        {/* Для сотрудников платформы карточка компании не нужна — их роли уже
            показаны в верхней приветственной плашке кабинета. */}
        {!isPlatformStaff ? (
          billing ? (
            <CompanyProfileForm billing={billing} onSaved={onBillingSaved} />
          ) : (
            <article className="card account-card">
              <h2>Компания</h2>
              <p className="page-subtitle">
                {billingState === "loading" ? "Загружаем реквизиты компании..." : "Данные компании пока недоступны."}
              </p>
            </article>
          )
        ) : null}
      </motion.div>
    </AccountScrollSection>
  );
}
