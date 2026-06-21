"use client";

import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { api, clearAccessToken, errorText } from "../../lib/api";
import type { AccountSession } from "./types";

export function useAccountSecurityActions({
  setSessions,
  token,
}: {
  setSessions: Dispatch<SetStateAction<AccountSession[]>>;
  token: string | null;
}) {
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [sessionBusyId, setSessionBusyId] = useState<string | null>(null);
  const [sessionsShown, setSessionsShown] = useState(3);

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
      setPasswordMessage(errorText(error, "Не удалось изменить пароль."));
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

  return {
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
    showMoreSessions: () => setSessionsShown((shown) => shown + 5),
  };
}
