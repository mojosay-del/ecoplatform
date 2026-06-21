"use client";

import { useEffect, useState } from "react";
import type { BillingStatus } from "@ecoplatform/shared";
import { api } from "../../lib/api";
import { useApiQuery } from "../shared";
import { accountGreeting } from "./format";
import type { AccountSession, NotificationPreferences } from "./types";

export function useAccountViewData(isPlatformStaff: boolean) {
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
  const greeting = useAccountGreeting();

  return {
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
  };
}

function useAccountGreeting() {
  const [greeting, setGreeting] = useState("Добрый день");

  useEffect(() => {
    setGreeting(accountGreeting());
  }, []);

  return greeting;
}
