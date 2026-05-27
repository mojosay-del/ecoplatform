"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { MarketingShell } from "../../src/components/MarketingShell";

const SUPPORT_EMAIL = "support@ecoplatform.local";

function copyTextFallback(value: string) {
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.top = "-9999px";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();

  if (!copied) {
    throw new Error("Copy command failed");
  }
}

// Восстановление пароля по email пока не реализовано: нет email-провайдера и
// токенов сброса. Чтобы не уводить пользователя в 404, страница объясняет,
// что делать сейчас, и даёт контакт поддержки.
export default function ForgotPasswordPage() {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copySupportEmail() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(SUPPORT_EMAIL);
      } else {
        copyTextFallback(SUPPORT_EMAIL);
      }
      setCopyStatus("copied");
    } catch {
      try {
        copyTextFallback(SUPPORT_EMAIL);
        setCopyStatus("copied");
      } catch {
        setCopyStatus("failed");
      }
    }
  }

  return (
    <MarketingShell>
      <div className="auth-card marketing-card">
        <header className="auth-card-head">
          <h1 className="auth-card-title">Восстановление пароля</h1>
          <p className="auth-card-sub">
            Пока на стадии MVP — самостоятельный сброс пароля будет доступен в ближайшем обновлении.
          </p>
        </header>
        <p className="page-subtitle">
          Если вы не можете войти, напишите администратору платформы — мы вручную поможем восстановить доступ.
        </p>
        <div className="forgot-support-contact">
          <span>Почта поддержки</span>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          <button className="button secondary forgot-support-copy" onClick={copySupportEmail} type="button">
            {copyStatus === "copied" ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
            {copyStatus === "copied" ? "Скопировано" : "Скопировать"}
          </button>
        </div>
        {copyStatus === "failed" ? (
          <p className="auth-copy-status" role="status">
            Не удалось скопировать автоматически. Выделите email вручную.
          </p>
        ) : null}
        <div className="auth-actions marketing-actions">
          <Link className="button" href="/login">
            Вернуться к входу
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
