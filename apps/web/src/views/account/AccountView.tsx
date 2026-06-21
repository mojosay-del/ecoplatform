"use client";

import { AppShell } from "../../components/AppShell";
import type { AccountSectionId } from "../../components/app-shell-nav";
import { useAuth } from "../../lib/auth";
import { accountNotificationRowsForRoles } from "../account-notification-rows";
import { AccountProfileSection } from "./AccountProfileSection";
import { DataPrivacySection } from "./DataPrivacySection";
import { NotificationsDialog } from "./NotificationsDialog";
import { PasswordDialog } from "./PasswordDialog";
import { PaymentDialog, SubscriptionDialog } from "./SubscriptionDialog";
import { SessionsDialog } from "./SessionsDialog";
import { useAccountDataPrivacyActions } from "./use-account-data-privacy-actions";
import { useAccountDialogRouting } from "./use-account-dialog-routing";
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
    closeSessionsDialog,
    closeSubscriptionDialog,
    notificationsDialogOpen,
    openNotificationsDialog,
    openPaymentDialog,
    openSessionsDialog,
    openSubscriptionDialog,
    openSupport,
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
          onBillingSaved={(updated) => setBilling(updated)}
          onOpenNotifications={openNotificationsDialog}
          onOpenPassword={openPasswordDialog}
          onOpenPayment={openPaymentDialog}
          onOpenSessions={openSessionsDialog}
          onOpenSubscription={openSubscriptionDialog}
          onProfileSaved={refreshMe}
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
        <SubscriptionDialog
          billing={billing}
          billingState={billingState}
          onBillingUpdated={setBilling}
          onClose={closeSubscriptionDialog}
          onOpenSupport={openSupport}
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
