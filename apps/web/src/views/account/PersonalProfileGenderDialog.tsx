import { useEffect, useState, type FormEvent } from "react";
import { Check, X } from "lucide-react";
import type { UserGender } from "@ecoplatform/shared";
import { api } from "../../lib/api";
import { useAccountDialogBodyLock } from "./hooks";
import { GENDER_OPTIONS } from "./personal-profile-options";

export function GenderEditDialog({
  currentValue,
  onClose,
  onSaved,
}: {
  currentValue: "" | UserGender;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<"" | UserGender>(currentValue);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedOption = GENDER_OPTIONS.find((option) => option.value === selected) ?? GENDER_OPTIONS[0]!;

  useAccountDialogBodyLock(true, onClose, saving);

  useEffect(() => {
    setSelected(currentValue);
    setMessage(null);
  }, [currentValue]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (selected === currentValue) {
      onClose();
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      await api.account.updateProfile({ gender: selected || null });
      await onSaved();
      onClose();
    } catch (error) {
      setSelected(currentValue);
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить пол.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      aria-labelledby="account-gender-dialog-title"
      aria-modal="true"
      className="account-password-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal account-gender-modal">
        <header className="account-password-modal-head">
          <div>
            <span className="account-password-modal-kicker">Личные данные</span>
            <h2 id="account-gender-dialog-title">Пол</h2>
            <p>Выберите вариант, который будет указан в профиле.</p>
          </div>
          <button
            aria-label="Закрыть выбор пола"
            className="account-password-modal-close"
            disabled={saving}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <form className="account-gender-modal-body" onSubmit={onSubmit}>
          <div className="account-gender-modal-options" role="radiogroup" aria-label="Пол">
            {GENDER_OPTIONS.map((option) => {
              const isSelected = option.value === selected;
              return (
                <button
                  aria-checked={isSelected}
                  className={`account-gender-modal-option${isSelected ? " is-selected" : ""}`}
                  disabled={saving}
                  key={option.value || "empty"}
                  onClick={() => setSelected(option.value)}
                  role="radio"
                  type="button"
                >
                  <span>{option.label}</span>
                  {isSelected ? <Check aria-hidden="true" size={17} /> : null}
                </button>
              );
            })}
          </div>
          {message ? <p className="account-form-message account-form-message-error">{message}</p> : null}
          <div className="account-gender-modal-actions">
            <button
              aria-label="Отменить выбор пола"
              className="account-gender-modal-action is-cancel"
              disabled={saving}
              onClick={onClose}
              type="button"
            >
              <X aria-hidden="true" size={20} />
            </button>
            <button
              aria-label={`Сохранить пол: ${selectedOption.label}`}
              className="account-gender-modal-action is-save"
              disabled={saving}
              type="submit"
            >
              <Check aria-hidden="true" size={21} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
