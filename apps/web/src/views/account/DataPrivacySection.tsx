import { Download, RotateCcw, Trash2 } from "lucide-react";
import type { User } from "../../lib/auth";
import { formatAccountDate } from "./format";
import { AccountScrollSection } from "./shared";

export function DataPrivacySection({
  deletionBusy,
  deletionMessage,
  exportBusy,
  exportMessage,
  onCancelDeletion,
  onExportData,
  onRequestDeletion,
  user,
}: {
  deletionBusy: boolean;
  deletionMessage: string | null;
  exportBusy: boolean;
  exportMessage: string | null;
  onCancelDeletion: () => void;
  onExportData: () => void;
  onRequestDeletion: () => void;
  user: User | null;
}) {
  return (
    <AccountScrollSection
      accountSection="data-privacy"
      description="Экспорт персональных данных и управление удалением аккаунта."
      title="Данные и приватность"
    >
      <div className="account-section-grid">
        <article className="card account-card">
          <h2>Мои данные</h2>
          <p className="page-subtitle">
            Архив включает профиль, согласия, сессии, уведомления, обращения и данные компании.
          </p>
          {exportMessage ? <p className="account-form-message">{exportMessage}</p> : null}
          <button className="button secondary" type="button" onClick={onExportData} disabled={exportBusy}>
            <Download size={16} />
            {exportBusy ? "Готовим..." : "Скачать архив"}
          </button>
        </article>
        <article className="card account-card account-danger-zone">
          <h2>Опасная зона</h2>
          {user?.deletionRequestedAt ? (
            <p className="page-subtitle">
              Удаление аккаунта запланировано на {formatAccountDate(user.deletionScheduledFor)}. До этой даты запрос
              можно отменить.
            </p>
          ) : (
            <p className="page-subtitle">
              Запрос ставит аккаунт в очередь удаления на 30 дней и закрывает функциональные разделы компании.
            </p>
          )}
          {deletionMessage ? <p className="account-form-message">{deletionMessage}</p> : null}
          {user?.deletionRequestedAt ? (
            <button className="button secondary" type="button" onClick={onCancelDeletion} disabled={deletionBusy}>
              <RotateCcw size={16} />
              {deletionBusy ? "Отменяем..." : "Передумал"}
            </button>
          ) : (
            <button
              className="button secondary danger"
              type="button"
              onClick={onRequestDeletion}
              disabled={deletionBusy}
            >
              <Trash2 size={16} />
              {deletionBusy ? "Планируем..." : "Запросить удаление"}
            </button>
          )}
        </article>
      </div>
    </AccountScrollSection>
  );
}
