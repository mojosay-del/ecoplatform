import { useEffect, useState } from "react";
import { AlertTriangle, Download, RotateCcw, ShieldCheck, Trash2, X } from "lucide-react";
import type { User } from "../../lib/auth";
import { formatAccountDate } from "./format";
import { useAccountDialogBodyLock } from "./hooks";

export function DataPrivacyDialog({
  deletionBusy,
  deletionMessage,
  exportBusy,
  exportMessage,
  onCancelDeletion,
  onClose,
  onExportData,
  onRequestDeletion,
  user,
}: {
  deletionBusy: boolean;
  deletionMessage: string | null;
  exportBusy: boolean;
  exportMessage: string | null;
  onCancelDeletion: () => void;
  onClose: () => void;
  onExportData: () => void;
  onRequestDeletion: () => void;
  user: User | null;
}) {
  const [confirmDeletion, setConfirmDeletion] = useState(false);
  const closeDisabled = deletionBusy || exportBusy;

  useAccountDialogBodyLock(true, onClose, closeDisabled);

  useEffect(() => {
    if (user?.deletionRequestedAt) {
      setConfirmDeletion(false);
    }
  }, [user?.deletionRequestedAt]);

  return (
    <div
      aria-labelledby="account-data-privacy-dialog-title"
      aria-modal="true"
      className="account-password-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal account-data-privacy-modal">
        <header className="account-password-modal-head">
          <div>
            <span className="account-password-modal-kicker">Приватность</span>
            <h2 id="account-data-privacy-dialog-title">Данные и приватность</h2>
            <p>Экспорт персональных данных и управление удалением аккаунта.</p>
          </div>
          <button
            aria-label="Закрыть данные и приватность"
            className="account-password-modal-close"
            disabled={closeDisabled}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="account-data-privacy-modal-body">
          <div className="account-data-privacy-summary">
            <div className="account-data-privacy-summary-main">
              <span className="account-data-privacy-summary-icon" aria-hidden="true">
                <ShieldCheck size={20} />
              </span>
              <div>
                <strong>Управление данными аккаунта</strong>
                <p>Здесь можно скачать архив данных или запланировать удаление с периодом отмены.</p>
              </div>
            </div>
            <span className="account-data-privacy-summary-chip">30 дней на отмену удаления</span>
          </div>
          <article className="card account-card account-data-privacy-card">
            <div className="account-data-privacy-card-head">
              <span className="account-data-privacy-icon account-data-privacy-icon-safe" aria-hidden="true">
                <ShieldCheck size={22} />
              </span>
              <div>
                <span className="account-data-privacy-eyebrow">Экспорт</span>
                <h2>Мои данные</h2>
                <p className="page-subtitle">
                  Архив включает профиль, согласия, сессии, уведомления, обращения и данные компании.
                </p>
              </div>
            </div>
            {exportMessage ? <p className="account-form-message">{exportMessage}</p> : null}
            <button
              className="button secondary account-block-button"
              type="button"
              onClick={onExportData}
              disabled={exportBusy}
            >
              <Download size={16} />
              {exportBusy ? "Готовим..." : "Скачать архив"}
            </button>
          </article>
          <article className="card account-card account-danger-zone account-data-privacy-card">
            <div className="account-data-privacy-card-head">
              <span className="account-data-privacy-icon account-data-privacy-icon-danger" aria-hidden="true">
                <AlertTriangle size={22} />
              </span>
              <div>
                <span className="account-data-privacy-eyebrow">Удаление</span>
                <h2>Опасная зона</h2>
                {user?.deletionRequestedAt ? (
                  <p className="page-subtitle">
                    Удаление аккаунта запланировано на {formatAccountDate(user.deletionScheduledFor)}. До этой даты
                    запрос можно отменить.
                  </p>
                ) : (
                  <p className="page-subtitle">
                    Запрос ставит аккаунт в очередь удаления на 30 дней и закрывает функциональные разделы компании.
                  </p>
                )}
              </div>
            </div>
            {deletionMessage ? <p className="account-form-message">{deletionMessage}</p> : null}
            {user?.deletionRequestedAt ? (
              <button
                className="button secondary account-block-button"
                type="button"
                onClick={onCancelDeletion}
                disabled={deletionBusy}
              >
                <RotateCcw size={16} />
                {deletionBusy ? "Отменяем..." : "Передумал"}
              </button>
            ) : confirmDeletion ? (
              <div className="account-data-privacy-confirm">
                <p>
                  Подтвердите запрос. До удаления останется 30 дней, но функциональные разделы компании закроются сразу.
                </p>
                <div className="account-data-privacy-confirm-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => setConfirmDeletion(false)}
                    disabled={deletionBusy}
                  >
                    Отмена
                  </button>
                  <button
                    className="button secondary danger"
                    type="button"
                    onClick={onRequestDeletion}
                    disabled={deletionBusy}
                  >
                    <Trash2 size={16} />
                    {deletionBusy ? "Планируем..." : "Подтвердить"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="button secondary danger account-block-button"
                type="button"
                onClick={() => setConfirmDeletion(true)}
                disabled={deletionBusy}
              >
                <Trash2 size={16} />
                Запросить удаление
              </button>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
