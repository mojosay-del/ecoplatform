"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import "../../news/news-modal.css";
import { Check, Copy, KeyRound, X } from "lucide-react";
import type { StaffItem } from "./types";

// Показывает временный пароль ровно один раз после сброса. Пароль нигде не
// хранится на клиенте кроме этого окна — закрытие убирает его из памяти.
export function StaffResetPasswordModal({
  staff,
  password,
  onClose,
}: {
  staff: StaffItem;
  password: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("news-modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove("news-modal-open");
    };
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по фону — мышиное удобство; с клавиатуры окно закрывается кнопкой закрытия и Escape
    <div
      className="news-modal-backdrop admin-sessions-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-labelledby={titleId}
      aria-modal="true"
    >
      <div className="news-modal staff-reset-modal">
        <button className="news-modal-close" onClick={onClose} type="button" aria-label="Закрыть">
          <X aria-hidden size={20} />
        </button>
        <header className="admin-sessions-modal-header">
          <p className="admin-sessions-modal-kicker">
            <KeyRound aria-hidden size={14} /> Новый пароль
          </p>
          <h2 id={titleId}>
            {staff.user.firstName} {staff.user.lastName}
          </h2>
          <p className="page-subtitle">{staff.user.email}</p>
        </header>

        <div className="staff-reset-body">
          <p className="staff-reset-warning">
            Пароль показывается один раз. Скопируйте его и передайте сотруднику по защищённому каналу — после закрытия
            окна восстановить его будет нельзя. Все активные сессии сотрудника сброшены.
          </p>
          <div className="staff-reset-password">
            <code className="staff-reset-code">{password}</code>
            <button className="button secondary" onClick={copy} type="button">
              {copied ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
              {copied ? "Скопировано" : "Копировать"}
            </button>
          </div>
        </div>

        <div className="form-actions">
          <button className="button" onClick={onClose} type="button">
            Готово
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
