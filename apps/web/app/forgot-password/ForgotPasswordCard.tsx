"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

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

export function ForgotPasswordCard({ supportEmail }: { supportEmail: string }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copySupportEmail() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(supportEmail);
      } else {
        copyTextFallback(supportEmail);
      }
      setCopyStatus("copied");
    } catch {
      try {
        copyTextFallback(supportEmail);
        setCopyStatus("copied");
      } catch {
        setCopyStatus("failed");
      }
    }
  }

  return (
    <div className="ui-card marketing-card">
      <header className="ui-card-head">
        <h1 className="ui-card-title">Восстановление пароля</h1>
        <p className="ui-card-sub">
          Пока на стадии MVP — самостоятельный сброс пароля будет доступен в ближайшем обновлении.
        </p>
      </header>
      <p className="page-subtitle">
        Если вы не можете войти, напишите администратору платформы — мы вручную поможем восстановить доступ.
      </p>
      <div className="forgot-support-contact">
        <span>Почта поддержки</span>
        <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
        <button className="button secondary forgot-support-copy" onClick={copySupportEmail} type="button">
          {copyStatus === "copied" ? <Check aria-hidden="true" size={15} /> : <Copy aria-hidden="true" size={15} />}
          {copyStatus === "copied" ? "Скопировано" : "Скопировать"}
        </button>
      </div>
      {copyStatus === "failed" ? (
        <p className="copy-status" role="status">
          Не удалось скопировать автоматически. Выделите email вручную.
        </p>
      ) : null}
      <div className="form-actions marketing-actions">
        <Link className="button" href="/login">
          Вернуться к входу
        </Link>
      </div>
    </div>
  );
}
