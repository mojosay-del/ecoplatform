import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { errorText, api } from "../../lib/api";
import type { User } from "../../lib/auth";
import { useAccountDialogBodyLock } from "./hooks";

export function NameEditDialog({
  onClose,
  onSaved,
  user,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  user: User;
}) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useAccountDialogBodyLock(true, onClose, saving);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFirstName = firstName.trim();
    const nextLastName = lastName.trim();
    if (!nextFirstName || !nextLastName) {
      setMessage("Заполните имя и фамилию.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await api.account.updateProfile({ firstName: nextFirstName, lastName: nextLastName });
      await onSaved();
      onClose();
    } catch (error) {
      setMessage(errorText(error, "Не удалось сохранить имя."));
    } finally {
      setSaving(false);
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по фону — мышиное удобство; с клавиатуры окно закрывается кнопкой закрытия и Escape
    <div
      aria-labelledby="account-name-dialog-title"
      aria-modal="true"
      className="account-password-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal">
        <header className="account-password-modal-head">
          <div>
            <span className="account-password-modal-kicker">Личные данные</span>
            <h2 id="account-name-dialog-title">Имя и фамилия</h2>
            <p>Измените данные, которые видны в профиле.</p>
          </div>
          <button
            aria-label="Закрыть редактирование имени"
            className="account-password-modal-close"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <form className="account-form account-password-modal-form" onSubmit={onSubmit}>
          <div className="account-form-grid-2">
            <label>
              <span>Фамилия</span>
              { }
              <input
                autoFocus
                autoComplete="family-name"
                className="input"
                onChange={(event) => setLastName(event.currentTarget.value)}
                required
                value={lastName}
              />
            </label>
            <label>
              <span>Имя</span>
              <input
                autoComplete="given-name"
                className="input"
                onChange={(event) => setFirstName(event.currentTarget.value)}
                required
                value={firstName}
              />
            </label>
          </div>
          {message ? <p className="account-form-message account-form-message-error">{message}</p> : null}
          <button className="button" disabled={saving} type="submit">
            {saving ? "Сохраняем..." : "Сохранить"}
          </button>
        </form>
      </section>
    </div>
  );
}
