"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  accountProfileModalHref,
  accountSectionHref,
  normalizeAccountProfileModal,
  type AccountProfileModalId,
} from "../../components/app-shell-nav";
import type { User } from "../../lib/auth";

export function useAccountDialogRouting({ isPlatformStaff, user }: { isPlatformStaff: boolean; user: User | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawProfileModal = searchParams.get("modal");
  const profileModal = normalizeAccountProfileModal(rawProfileModal);
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [sessionsDialogOpen, setSessionsDialogOpen] = useState(false);
  const [notificationsDialogOpen, setNotificationsDialogOpen] = useState(false);
  const [dataPrivacyDialogOpen, setDataPrivacyDialogOpen] = useState(false);

  useEffect(() => {
    if (!rawProfileModal) {
      setSubscriptionDialogOpen(false);
      setSessionsDialogOpen(false);
      setNotificationsDialogOpen(false);
      setDataPrivacyDialogOpen(false);
      return;
    }

    if (!user) return;

    if (!profileModal || (isPlatformStaff && profileModal !== "data-privacy")) {
      router.replace(accountSectionHref("profile"), { scroll: false });
      return;
    }

    setSubscriptionDialogOpen(profileModal === "subscription");
    setSessionsDialogOpen(profileModal === "sessions");
    setNotificationsDialogOpen(profileModal === "notifications");
    setDataPrivacyDialogOpen(profileModal === "data-privacy");
  }, [isPlatformStaff, profileModal, rawProfileModal, router, user]);

  function clearProfileModalParam(modal: AccountProfileModalId) {
    if (profileModal === modal) {
      router.replace(accountSectionHref("profile"), { scroll: false });
    }
  }

  function openProfileModal(modal: AccountProfileModalId) {
    setSubscriptionDialogOpen(modal === "subscription");
    setSessionsDialogOpen(modal === "sessions");
    setNotificationsDialogOpen(modal === "notifications");
    setDataPrivacyDialogOpen(modal === "data-privacy");
    router.push(accountProfileModalHref(modal), { scroll: false });
  }

  function closeSubscriptionDialog() {
    setSubscriptionDialogOpen(false);
    clearProfileModalParam("subscription");
  }

  function closeDataPrivacyDialog() {
    setDataPrivacyDialogOpen(false);
    clearProfileModalParam("data-privacy");
  }

  function closeSessionsDialog() {
    setSessionsDialogOpen(false);
    clearProfileModalParam("sessions");
  }

  function closeNotificationsDialog() {
    setNotificationsDialogOpen(false);
    clearProfileModalParam("notifications");
  }

  return {
    closeDataPrivacyDialog,
    closeNotificationsDialog,
    closePaymentDialog: () => setPaymentDialogOpen(false),
    closeSessionsDialog,
    closeSubscriptionDialog,
    dataPrivacyDialogOpen,
    notificationsDialogOpen,
    openDataPrivacyDialog: () => openProfileModal("data-privacy"),
    openNotificationsDialog: () => openProfileModal("notifications"),
    openPaymentDialog: () => setPaymentDialogOpen(true),
    openSessionsDialog: () => openProfileModal("sessions"),
    openSubscriptionDialog: () => openProfileModal("subscription"),
    paymentDialogOpen,
    sessionsDialogOpen,
    subscriptionDialogOpen,
  };
}
