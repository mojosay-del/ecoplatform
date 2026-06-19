import { X } from "lucide-react";
import { useAccountDialogBodyLock } from "./hooks";
import "../../components/notifications.css";

type NotificationRow = {
  category: string;
  description: string;
  label: string;
};

export function NotificationsDialog({
  notificationBusyKey,
  notificationEnabled,
  notificationPreferencesState,
  notificationRows,
  onClose,
  updateNotificationPreference,
}: {
  notificationBusyKey: string | null;
  notificationEnabled: (category: string, channel: "in_app" | "email") => boolean;
  notificationPreferencesState: string;
  notificationRows: NotificationRow[];
  onClose: () => void;
  updateNotificationPreference: (category: string, channel: "in_app" | "email", enabled: boolean) => Promise<void>;
}) {
  useAccountDialogBodyLock(true, onClose);

  return (
    <div
      aria-labelledby="account-notifications-dialog-title"
      aria-modal="true"
      className="account-password-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal account-notifications-modal">
        <header className="account-password-modal-head">
          <div>
            <span className="account-password-modal-kicker">Настройки</span>
            <h2 id="account-notifications-dialog-title">Уведомления</h2>
            <p>Какие уведомления показывать в личном кабинете.</p>
          </div>
          <button
            aria-label="Закрыть уведомления"
            className="account-password-modal-close"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="account-notifications-modal-body">
          <article className="card account-card">
            <div className="account-notification-table">
              <div className="account-notification-head">
                <span>Категория</span>
                <span>В кабинете</span>
              </div>
              {notificationRows.map((row) => {
                const busyKey = `${row.category}:in_app`;
                return (
                  <div className="account-notification-row" key={row.category}>
                    <div>
                      <strong>{row.label}</strong>
                      <p>{row.description}</p>
                    </div>
                    <label className="account-switch">
                      <input
                        checked={notificationEnabled(row.category, "in_app")}
                        disabled={notificationPreferencesState === "loading" || notificationBusyKey === busyKey}
                        onChange={(event) =>
                          void updateNotificationPreference(row.category, "in_app", event.currentTarget.checked)
                        }
                        type="checkbox"
                      />
                      <span className="account-switch-track" aria-hidden="true" />
                    </label>
                  </div>
                );
              })}
            </div>
            {notificationPreferencesState === "loading" ? (
              <p className="page-subtitle">Загружаем настройки уведомлений...</p>
            ) : null}
            {notificationPreferencesState === "error" ? (
              <p className="account-form-message">Не удалось загрузить настройки уведомлений.</p>
            ) : null}
          </article>
        </div>
      </section>
    </div>
  );
}
