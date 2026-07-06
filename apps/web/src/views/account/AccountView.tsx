"use client";

import { useState } from "react";
import { AppShell } from "../../components/AppShell";
import type { AccountSectionId } from "../../components/app-shell-nav";
import { useAuth } from "../../lib/auth";
import { accountNotificationRowsForRoles } from "../account-notification-rows";
import { AccountProfileSection } from "./AccountProfileSection";
import { CompanyMembersDialog } from "./CompanyMembersDialog";
import { DataPrivacyDialog } from "./DataPrivacyDialog";
import { NotificationsDialog } from "./NotificationsDialog";
import { PasswordDialog } from "./PasswordDialog";
import { PaymentDialog, SubscriptionDialog } from "./SubscriptionDialog";
import { SessionsDialog } from "./SessionsDialog";
import { useAccountDataPrivacyActions } from "./use-account-data-privacy-actions";
import { useAccountDialogRouting } from "./use-account-dialog-routing";
import { useAccountMembersSummary } from "./use-account-members-summary";
import { useAccountNotificationPreferences } from "./use-account-notification-preferences";
import { useAccountSectionNavigation } from "./use-account-section-navigation";
import { useAccountSecurityActions } from "./use-account-security-actions";
import { useAccountViewData } from "./use-account-view-data";

export function AccountView({ section }: { section: AccountSectionId }) {
  const { user, token, refreshMe } = useAuth();
  const isPlatformStaff = (user?.platformRoles?.length ?? 0) > 0;
  const {
    billing,
    billingState,
    greeting,
    notificationPreferences,
    notificationPreferencesState,
    sessions,
    sessionsState,
    setBilling,
    setNotificationPreferences,
    setSessions,
  } = useAccountViewData(isPlatformStaff);
  const {
    closeNotificationsDialog,
    closePaymentDialog,
    closeDataPrivacyDialog,
    closeSessionsDialog,
    closeSubscriptionDialog,
    dataPrivacyDialogOpen,
    notificationsDialogOpen,
    openDataPrivacyDialog,
    openNotificationsDialog,
    openPaymentDialog,
    openSessionsDialog,
    openSubscriptionDialog,
    paymentDialogOpen,
    sessionsDialogOpen,
    subscriptionDialogOpen,
  } = useAccountDialogRouting({ isPlatformStaff, user });
  const {
    closePasswordDialog,
    logoutEverywhere,
    onChangePassword,
    openPasswordDialog,
    passwordDialogOpen,
    passwordMessage,
    passwordSaving,
    revokeSession,
    sessionBusyId,
    sessionsShown,
    showMoreSessions,
  } = useAccountSecurityActions({ setSessions, token });
  const { cancelDeletion, deletionBusy, deletionMessage, exportBusy, exportData, exportMessage, requestDeletion } =
    useAccountDataPrivacyActions({ refreshMe, token });
  const { notificationBusyKey, notificationEnabled, updateNotificationPreference } = useAccountNotificationPreferences({
    notificationPreferences,
    setNotificationPreferences,
    token,
  });
  const [membersOpen, setMembersOpen] = useState(false);
  const {
    reload: reloadMembersSummary,
    state: membersSummaryState,
    summary: membersSummary,
  } = useAccountMembersSummary(!isPlatformStaff && user?.companyRole === "owner");
  const targetLayoutKey = `${billingState}|${sessionsState}|${notificationPreferencesState}`;
  const notificationRows = accountNotificationRowsForRoles(user?.platformRoles ?? []);

  useAccountSectionNavigation({ targetLayoutKey, targetSection: section });

  return (
    <AppShell>
      <section className="page account-scroll-page">
        <AccountProfileSection
          billing={billing}
          billingState={billingState}
          greeting={greeting}
          isPlatformStaff={isPlatformStaff}
          membersSummary={membersSummary}
          membersSummaryState={membersSummaryState}
          notificationPreferences={notificationPreferences}
          notificationPreferencesState={notificationPreferencesState}
          onBillingSaved={(updated) => setBilling(updated)}
          onOpenDataPrivacy={openDataPrivacyDialog}
          onOpenNotifications={openNotificationsDialog}
          onOpenPassword={openPasswordDialog}
          onOpenPayment={openPaymentDialog}
          onOpenMembers={() => setMembersOpen(true)}
          onOpenSessions={openSessionsDialog}
          onOpenSubscription={openSubscriptionDialog}
          onProfileSaved={refreshMe}
          sessionsCount={sessions.length}
          sessionsState={sessionsState}
          user={user}
        />
      </section>
      {membersOpen ? (
        <CompanyMembersDialog
          onClose={() => {
            setMembersOpen(false);
            // Обновляем сводку на плитке — состав команды мог измениться.
            reloadMembersSummary();
          }}
        />
      ) : null}
      {subscriptionDialogOpen ? (
        <SubscriptionDialog
          billing={billing}
          billingState={billingState}
          onBillingUpdated={setBilling}
          onClose={closeSubscriptionDialog}
        />
      ) : null}
      {paymentDialogOpen ? (
        <PaymentDialog billing={billing} billingState={billingState} onClose={closePaymentDialog} />
      ) : null}
      {sessionsDialogOpen ? (
        <SessionsDialog
          onClose={closeSessionsDialog}
          onLogoutEverywhere={() => void logoutEverywhere()}
          onRevokeSession={revokeSession}
          onShowMore={showMoreSessions}
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
      {dataPrivacyDialogOpen ? (
        <DataPrivacyDialog
          deletionBusy={deletionBusy}
          deletionMessage={deletionMessage}
          exportBusy={exportBusy}
          exportMessage={exportMessage}
          onCancelDeletion={() => void cancelDeletion()}
          onClose={closeDataPrivacyDialog}
          onExportData={() => void exportData()}
          onRequestDeletion={() => void requestDeletion()}
          user={user}
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
