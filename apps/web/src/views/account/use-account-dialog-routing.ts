"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
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

  return {
    closeNotificationsDialog,
    closePaymentDialog: () => setPaymentDialogOpen(false),
    closeSessionsDialog,
    closeSubscriptionDialog,
    notificationsDialogOpen,
    openNotificationsDialog: () => setNotificationsDialogOpen(true),
    openPaymentDialog: () => setPaymentDialogOpen(true),
    openSessionsDialog: () => setSessionsDialogOpen(true),
    openSubscriptionDialog: () => setSubscriptionDialogOpen(true),
    openSupport,
    paymentDialogOpen,
    sessionsDialogOpen,
    subscriptionDialogOpen,
  };
}
