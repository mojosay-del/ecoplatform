"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import "../../news/news-modal.css";
import { X } from "lucide-react";
import { StatusPill } from "../../../components/StatusPill";
import type { AdminUserDetail, AdminUserSession } from "./types";
import { formatSessionDateTime } from "./format";

export function AdminUserSessionsModal({
  user,
  sessions,
  onClose,
}: {
  user: AdminUserDetail;
  sessions: AdminUserSession[];
  onClose: () => void;
}) {
  const titleId = useId();

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
      <div className="news-modal admin-sessions-modal">
        <button className="news-modal-close" onClick={onClose} type="button" aria-label="Закрыть">
          <X aria-hidden size={20} />
        </button>
        <header className="admin-sessions-modal-header">
          <p className="admin-sessions-modal-kicker">Пользователь</p>
          <h2 id={titleId}>
            {user.firstName} {user.lastName}
          </h2>
          <p className="page-subtitle">{user.email}</p>
        </header>
        <div className="admin-sessions-list">
          {sessions.map((session) => (
            <article className="admin-session-card" key={session.id}>
              <div>
                <strong>{session.userAgent ?? "Без UA"}</strong>
                <p>
                  IP {session.ipAddress ?? "—"} · вход {formatSessionDateTime(session.createdAt)}
                </p>
              </div>
              <StatusPill variant={session.revokedAt ? "neutral" : "success"}>
                {session.revokedAt ? "Отозвана" : "Активна"}
              </StatusPill>
              <small>
                {session.revokedAt
                  ? `Отозвана ${formatSessionDateTime(session.revokedAt)}`
                  : `До ${formatSessionDateTime(session.expiresAt)}`}
              </small>
            </article>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
