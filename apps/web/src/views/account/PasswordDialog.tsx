import type { FormEvent } from "react";
import { KeyRound, X } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@ecoplatform/shared";
import { useAccountDialogBodyLock } from "./hooks";

export function PasswordDialog({
  onChangePassword,
  onClose,
  passwordMessage,
  passwordSaving,
}: {
  onChangePassword: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
  passwordMessage: string | null;
  passwordSaving: boolean;
}) {
  useAccountDialogBodyLock(true, onClose, passwordSaving);

  return (
    <div
      aria-labelledby="account-password-dialog-title"
      aria-modal="true"
      className="account-password-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal">
        <header className="account-password-modal-head">
          <div>
            <span className="account-password-modal-kicker">Безопасность</span>
            <h2 id="account-password-dialog-title">Смена пароля</h2>
            <p>Введите текущий пароль и новый пароль дважды.</p>
          </div>
          <button
            aria-label="Закрыть смену пароля"
            className="account-password-modal-close"
            disabled={passwordSaving}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <form className="account-form account-password-modal-form" onSubmit={onChangePassword}>
          <label>
            <span>Текущий пароль</span>
            <input
              autoComplete="current-password"
              autoFocus
              className="input"
              name="currentPassword"
              required
              type="password"
            />
          </label>
          <label>
            <span>Новый пароль</span>
            <input
              autoComplete="new-password"
              className="input"
              minLength={MIN_PASSWORD_LENGTH}
              name="newPassword"
              required
              type="password"
            />
          </label>
          <label>
            <span>Повтор нового пароля</span>
            <input
              autoComplete="new-password"
              className="input"
              minLength={MIN_PASSWORD_LENGTH}
              name="repeatPassword"
              required
              type="password"
            />
          </label>
          {passwordMessage ? <p className="account-form-message">{passwordMessage}</p> : null}
          <button className="button" type="submit" disabled={passwordSaving}>
            <KeyRound size={16} />
            {passwordSaving ? "Сохраняем..." : "Сменить пароль"}
          </button>
        </form>
      </section>
    </div>
  );
}
