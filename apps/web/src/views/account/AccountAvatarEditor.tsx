"use client";

// Редактор аватара профиля. Фото грузится общим аплоадером (api.files.upload →
// /files/upload, ресайз пресетом cover, публичный доступ), затем привязывается к
// пользователю через api.account.setAvatar. Нет фото → нейтральная иконка
// человека (пол не раскрывается). После изменения дёргаем refreshMe, чтобы новый
// аватар появился во всех местах (шапка, кабинет, лента, комментарии).

import Image from "next/image";
import { Camera, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { api, apiUploadFileWithProgress } from "../../lib/api";
import { useAuth } from "../../lib/auth";

export function AccountAvatarEditor() {
  const { user, refreshMe } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Аватаром может быть только изображение.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const asset = await apiUploadFileWithProgress(file, { accessLevel: "public", imagePreset: "cover" });
      await api.account.setAvatar(asset.id);
      await refreshMe();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось загрузить фото.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setError(null);
    setBusy(true);
    try {
      await api.account.removeAvatar();
      await refreshMe();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось убрать фото.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-avatar-edit">
      <button
        type="button"
        className={`account-welcome-avatar account-avatar-trigger ${user?.avatarUrl ? "has-image" : ""}`}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Загрузить фото профиля"
        aria-label="Загрузить фото профиля"
      >
        {user?.avatarUrl ? (
          <Image alt="" src={user.avatarUrl} width={84} height={84} />
        ) : (
          <UserRound size={38} aria-hidden="true" />
        )}
        <span className="account-avatar-badge" aria-hidden="true">
          {busy ? <span className="account-avatar-spinner" /> : <Camera size={15} />}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void uploadFile(file);
        }}
      />
      {user?.avatarUrl ? (
        <button type="button" className="account-avatar-remove" onClick={() => void removeAvatar()} disabled={busy}>
          Удалить фото
        </button>
      ) : null}
      {error ? <span className="account-avatar-error">{error}</span> : null}
    </div>
  );
}
