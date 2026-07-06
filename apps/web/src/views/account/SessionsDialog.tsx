import { ChevronDown, Monitor, Smartphone, X } from "lucide-react";
import { AnimatedNavIcon } from "../../components/app-shell/nav-icons";
import { StatusPill } from "../../components/StatusPill";
import { describeSessionDevice, formatAccountDateTime } from "./format";
import { useAccountDialogBodyLock } from "./hooks";
import type { AccountSession } from "./types";

export function SessionsDialog({
  onClose,
  onLogoutEverywhere,
  onRevokeSession,
  onShowMore,
  sessionBusyId,
  sessions,
  sessionsShown,
  sessionsState,
}: {
  onClose: () => void;
  onLogoutEverywhere: () => void;
  onRevokeSession: (sessionId: string) => Promise<void>;
  onShowMore: () => void;
  sessionBusyId: string | null;
  sessions: AccountSession[];
  sessionsShown: number;
  sessionsState: string;
}) {
  useAccountDialogBodyLock(true, onClose);

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по фону закрывает (мышиное удобство);клавиатурный паритет даёт Escape (useAccountDialogBodyLock) + кнопка закрытия
    <div
      aria-labelledby="account-sessions-dialog-title"
      aria-modal="true"
      className="account-password-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal account-sessions-modal">
        <header className="account-password-modal-head">
          <span aria-hidden="true" className="account-modal-icon account-stat-info">
            <AnimatedNavIcon name="sessions" size={22} />
          </span>
          <div>
            <span className="account-password-modal-kicker">Доступ</span>
            <h2 id="account-sessions-dialog-title">Сессии</h2>
            <p>Устройства, с которых сейчас открыт кабинет.</p>
          </div>
          <button aria-label="Закрыть сессии" className="account-password-modal-close" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="account-sessions-modal-body">
          <article className="card account-card">
            <div className="account-card-head">
              <div>
                <h2>Активные сессии</h2>
                <p className="page-subtitle">Всего устройств: {sessions.length}</p>
              </div>
              <button
                className="button secondary danger"
                onClick={onLogoutEverywhere}
                type="button"
                disabled={sessionBusyId === "all"}
              >
                Выйти со всех устройств
              </button>
            </div>
            {sessionsState === "loading" ? <p className="page-subtitle">Загружаем сессии...</p> : null}
            <div className="account-session-list">
              {sessions.slice(0, sessionsShown).map((session) => {
                const mobile = /iPhone|iPad|Android/i.test(session.userAgent ?? "");
                const DeviceIcon = mobile ? Smartphone : Monitor;
                return (
                  <div className="account-session-card" key={session.id}>
                    <div className="account-session-left">
                      <span className="account-session-ic">
                        <DeviceIcon size={20} />
                      </span>
                      <div className="account-session-meta">
                        <strong>
                          {describeSessionDevice(session.userAgent)}
                          {session.current ? (
                            <>
                              {" "}
                              <StatusPill variant="brand">Текущая</StatusPill>
                            </>
                          ) : null}
                        </strong>
                        <span>
                          IP {session.ipAddress ?? "—"} · {formatAccountDateTime(session.updatedAt)} · до{" "}
                          {formatAccountDateTime(session.expiresAt)}
                        </span>
                      </div>
                    </div>
                    {!session.current ? (
                      <button
                        className="button secondary"
                        onClick={() => void onRevokeSession(session.id)}
                        type="button"
                        disabled={sessionBusyId === session.id}
                      >
                        Отозвать
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {sessionsState !== "loading" && sessions.length === 0 ? (
                <p className="page-subtitle">Активных сессий не найдено.</p>
              ) : null}
            </div>
            {sessions.length > sessionsShown ? (
              <button className="button secondary account-block-button" type="button" onClick={onShowMore}>
                <ChevronDown size={16} />
                Показать ещё ({sessions.length - sessionsShown})
              </button>
            ) : null}
          </article>
        </div>
      </section>
    </div>
  );
}
