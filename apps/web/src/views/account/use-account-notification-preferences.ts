"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { api } from "../../lib/api";
import type { NotificationPreferences } from "./types";

export function useAccountNotificationPreferences({
  notificationPreferences,
  setNotificationPreferences,
  token,
}: {
  notificationPreferences: NotificationPreferences | null;
  setNotificationPreferences: Dispatch<SetStateAction<NotificationPreferences | null>>;
  token: string | null;
}) {
  const [notificationBusyKey, setNotificationBusyKey] = useState<string | null>(null);

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

  return {
    notificationBusyKey,
    notificationEnabled,
    updateNotificationPreference,
  };
}
