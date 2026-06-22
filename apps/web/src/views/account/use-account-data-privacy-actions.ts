"use client";

import { useState } from "react";
import { api, errorText } from "../../lib/api";
import { formatAccountDate } from "./format";

export function useAccountDataPrivacyActions({
  refreshMe,
  token,
}: {
  refreshMe: () => Promise<void>;
  token: string | null;
}) {
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [deletionMessage, setDeletionMessage] = useState<string | null>(null);

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
      setExportMessage(errorText(error, "Не удалось подготовить экспорт."));
    } finally {
      setExportBusy(false);
    }
  }

  async function requestDeletion() {
    if (!token) return;
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
      setDeletionMessage(errorText(error, "Не удалось запланировать удаление."));
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
      setDeletionMessage(errorText(error, "Не удалось отменить удаление."));
    } finally {
      setDeletionBusy(false);
    }
  }

  return {
    cancelDeletion,
    deletionBusy,
    deletionMessage,
    exportBusy,
    exportData,
    exportMessage,
    requestDeletion,
  };
}
