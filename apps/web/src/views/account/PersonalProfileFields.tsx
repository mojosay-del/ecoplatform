import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Check, Mail, X } from "lucide-react";
import type { UserGender } from "@ecoplatform/shared";
import {
  DEFAULT_PHONE_COUNTRY,
  PHONE_COUNTRIES,
  VERIFICATION_AUTO_SUBMIT_DELAY_MS,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_ERROR_RESET_DELAY_MS,
  VERIFICATION_SUCCESS_REDIRECT_DELAY_MS,
} from "../../components/auth/constants";
import { PhoneInput } from "../../components/auth/phone-input";
import type { PhoneCountryId, VerificationPhase } from "../../components/auth/types";
import {
  emptyVerificationDigits,
  formatPhoneFull,
  getPhoneCountry,
  normalizeEmailValue,
} from "../../components/auth/utils";
import { api } from "../../lib/api";
import type { User } from "../../lib/auth";
import { USER_GENDER_LABELS } from "../../lib/display-labels";
import { useAccountDialogBodyLock } from "./hooks";
import { AccountEditableValue } from "./shared";

type ContactField = "email" | "phone";

const GENDER_OPTIONS: Array<{ value: "" | UserGender; label: string }> = [
  { value: "", label: "Не указано" },
  { value: "male", label: USER_GENDER_LABELS.male ?? "Мужской" },
  { value: "female", label: USER_GENDER_LABELS.female ?? "Женский" },
];

export function AccountNameValue({ onSaved, user }: { onSaved: () => Promise<void>; user: User | null }) {
  const [open, setOpen] = useState(false);
  const fullName = user ? `${user.firstName} ${user.lastName}` : null;

  return (
    <>
      <AccountEditableValue value={fullName} label="Имя и фамилия" onEdit={() => setOpen(true)} />
      {open && user ? <NameEditDialog onClose={() => setOpen(false)} onSaved={onSaved} user={user} /> : null}
    </>
  );
}

export function AccountGenderValue({ onSaved, value }: { onSaved: () => Promise<void>; value: User["gender"] | null }) {
  const currentValue = value ?? "";
  const [open, setOpen] = useState(false);
  const currentOption = GENDER_OPTIONS.find((option) => option.value === currentValue) ?? GENDER_OPTIONS[0]!;

  return (
    <>
      <AccountEditableValue value={currentOption.label} label="Пол" onEdit={() => setOpen(true)} />
      {open ? <GenderEditDialog currentValue={currentValue} onClose={() => setOpen(false)} onSaved={onSaved} /> : null}
    </>
  );
}

function GenderEditDialog({
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

export function AccountContactValue({
  field,
  label,
  onSaved,
  value,
}: {
  field: ContactField;
  label: string;
  onSaved: () => Promise<void>;
  value?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AccountEditableValue value={value} label={label} onEdit={() => setOpen(true)} />
      {open ? (
        <ContactChangeDialog
          currentValue={value ?? ""}
          field={field}
          label={label}
          onClose={() => setOpen(false)}
          onSaved={onSaved}
        />
      ) : null}
    </>
  );
}

function NameEditDialog({ onClose, onSaved, user }: { onClose: () => void; onSaved: () => Promise<void>; user: User }) {
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
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить имя.");
    } finally {
      setSaving(false);
    }
  }

  return (
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
              <input
                autoComplete="family-name"
                autoFocus
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

function ContactChangeDialog({
  currentValue,
  field,
  label,
  onClose,
  onSaved,
}: {
  currentValue: string;
  field: ContactField;
  label: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [verification, setVerification] = useState<{ verificationId: string; email: string; expiresAt: string } | null>(
    null,
  );
  const [step, setStep] = useState<"code" | "edit">("code");
  const [codeDigits, setCodeDigits] = useState<string[]>(emptyVerificationDigits);
  const [phase, setPhase] = useState<VerificationPhase>("typing");
  const [message, setMessage] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailValue, setEmailValue] = useState(field === "email" ? normalizeEmailValue(currentValue) : "");
  const initialPhone = phoneStateFromValue(field === "phone" ? currentValue : "");
  const [phoneCountryId, setPhoneCountryId] = useState<PhoneCountryId>(initialPhone.countryId);
  const [phoneDigits, setPhoneDigits] = useState(initialPhone.digits);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const attemptRef = useRef(0);
  const resetTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const busy = requesting || saving || phase === "checking";
  const code = codeDigits.join("");
  const codeComplete = code.length === VERIFICATION_CODE_LENGTH;
  const expiresAt = verification
    ? new Date(verification.expiresAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "";
  const contactTitle = field === "email" ? "email" : "телефона";

  useAccountDialogBodyLock(true, onClose, busy);

  const clearTimers = useCallback(() => {
    if (resetTimerRef.current) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    if (successTimerRef.current) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }, []);

  const requestCode = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    clearTimers();
    setRequesting(true);
    setVerification(null);
    setStep("code");
    setCodeDigits(emptyVerificationDigits());
    setPhase("typing");
    setMessage(null);
    try {
      const result = await api.account.startContactChange({ field });
      if (requestIdRef.current !== requestId) return;
      setVerification(result);
      window.setTimeout(() => inputRefs.current[0]?.focus(), 0);
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setMessage(error instanceof Error ? error.message : "Не удалось отправить код.");
    } finally {
      if (requestIdRef.current === requestId) setRequesting(false);
    }
  }, [clearTimers, field]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  useEffect(() => {
    if (step !== "code" || !verification || phase !== "typing" || !codeComplete) return;
    const timer = window.setTimeout(() => void confirmCode(code), VERIFICATION_AUTO_SUBMIT_DELAY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, codeComplete, phase, step, verification?.verificationId]);

  async function confirmCode(nextCode: string) {
    if (!verification || phase !== "typing" || !/^\d{4}$/.test(nextCode)) return;
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    clearTimers();
    setPhase("checking");
    setMessage(null);
    try {
      await api.account.verifyContactChange({ verificationId: verification.verificationId, code: nextCode });
      if (attemptRef.current !== attempt) return;
      setPhase("success");
      successTimerRef.current = window.setTimeout(() => {
        if (attemptRef.current !== attempt) return;
        setStep("edit");
        setPhase("typing");
      }, VERIFICATION_SUCCESS_REDIRECT_DELAY_MS);
    } catch (error) {
      if (attemptRef.current !== attempt) return;
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Код не подошёл.");
      resetTimerRef.current = window.setTimeout(() => {
        if (attemptRef.current !== attempt) return;
        setCodeDigits(emptyVerificationDigits());
        setPhase("typing");
        window.setTimeout(() => inputRefs.current[0]?.focus(), 0);
      }, VERIFICATION_ERROR_RESET_DELAY_MS);
    }
  }

  function setCodeDigit(index: number, rawValue: string) {
    if (phase !== "typing") return;
    const digits = rawValue.replace(/\D/g, "");
    setCodeDigits((current) => {
      const next = [...current];
      if (!digits) {
        next[index] = "";
        return next;
      }
      for (let offset = 0; offset < digits.length && index + offset < VERIFICATION_CODE_LENGTH; offset += 1) {
        next[index + offset] = digits[offset]!;
      }
      return next;
    });
    const nextIndex = Math.min(VERIFICATION_CODE_LENGTH - 1, index + Math.max(1, digits.length));
    window.setTimeout(() => inputRefs.current[nextIndex]?.focus(), 0);
  }

  function onCodeKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (phase !== "typing") return;
    if (event.key === "Backspace" && codeDigits[index] === "" && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      inputRefs.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < VERIFICATION_CODE_LENGTH - 1) {
      event.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  async function onSubmitNewValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verification) return;

    setSaving(true);
    setMessage(null);
    try {
      if (field === "email") {
        await api.account.applyContactChange({
          field,
          verificationId: verification.verificationId,
          email: normalizeEmailValue(emailValue),
        });
      } else {
        const phone = formatPhoneFull(getPhoneCountry(phoneCountryId), phoneDigits);
        if (!phone) {
          setMessage("Введите полный номер телефона.");
          return;
        }
        await api.account.applyContactChange({ field, verificationId: verification.verificationId, phone });
      }
      await onSaved();
      onClose();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить новое значение.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      aria-labelledby="account-contact-dialog-title"
      aria-modal="true"
      className="account-password-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
      role="dialog"
    >
      <section className="account-password-modal account-contact-modal">
        <header className="account-password-modal-head">
          <div>
            <span className="account-password-modal-kicker">Подтверждение</span>
            <h2 id="account-contact-dialog-title">Смена {contactTitle}</h2>
            <p>Код будет отправлен на текущий email аккаунта.</p>
          </div>
          <button
            aria-label={`Закрыть смену ${contactTitle}`}
            className="account-password-modal-close"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        {step === "code" ? (
          <div className="account-contact-modal-body">
            <div className="account-contact-code-head">
              <span className="account-contact-code-icon" aria-hidden="true">
                <Mail size={22} />
              </span>
              <div>
                <strong>
                  {requesting ? "Отправляем код..." : verification ? "Введите код из письма" : "Отправьте код"}
                </strong>
                <p>
                  {verification
                    ? `Письмо отправлено на ${verification.email}, код действует до ${expiresAt}.`
                    : requesting
                      ? "Подготавливаем письмо с кодом подтверждения."
                      : "Код придёт на текущий email аккаунта после нажатия на кнопку."}
                </p>
              </div>
            </div>
            {verification ? (
              <div className={`auth-code-stage is-${phase}`} aria-busy={phase === "checking"} data-phase={phase}>
                <div className="auth-code-digits" aria-hidden={phase !== "typing"}>
                  {codeDigits.map((digit, index) => (
                    <input
                      aria-label={`Цифра ${index + 1} из ${VERIFICATION_CODE_LENGTH}`}
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      className={`auth-code-box${digit ? " is-filled" : ""}`}
                      disabled={phase !== "typing"}
                      inputMode="numeric"
                      key={index}
                      maxLength={VERIFICATION_CODE_LENGTH}
                      onChange={(event) => setCodeDigit(index, event.currentTarget.value)}
                      onKeyDown={(event) => onCodeKeyDown(index, event)}
                      pattern="[0-9]"
                      ref={(element) => {
                        inputRefs.current[index] = element;
                      }}
                      type="text"
                      value={digit}
                    />
                  ))}
                </div>
                <div className="auth-code-orb" aria-hidden={phase === "typing"}>
                  {phase === "checking" ? <span className="auth-code-spinner" /> : null}
                  {phase === "success" ? <Check size={34} strokeWidth={3} aria-hidden="true" /> : null}
                  {phase === "error" ? <X size={34} strokeWidth={3} aria-hidden="true" /> : null}
                </div>
              </div>
            ) : null}
            {message ? <p className="account-form-message account-form-message-error">{message}</p> : null}
            <div className="account-contact-actions">
              {verification ? (
                <>
                  <button
                    className="button"
                    disabled={phase !== "typing" || !codeComplete}
                    onClick={() => void confirmCode(code)}
                    type="button"
                  >
                    {phase === "checking" ? "Проверяем..." : "Проверить код"}
                  </button>
                  <button
                    className="button secondary"
                    disabled={requesting || phase === "checking"}
                    onClick={() => void requestCode()}
                    type="button"
                  >
                    Отправить код ещё раз
                  </button>
                </>
              ) : (
                <button className="button" disabled={requesting} onClick={() => void requestCode()} type="button">
                  {requesting ? "Отправляем..." : "Отправить код"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <form className="account-form account-password-modal-form" onSubmit={onSubmitNewValue}>
            {field === "email" ? (
              <label>
                <span>Новый email</span>
                <input
                  autoComplete="email"
                  autoFocus
                  className="input"
                  onChange={(event) => setEmailValue(event.currentTarget.value)}
                  required
                  type="email"
                  value={emailValue}
                />
              </label>
            ) : (
              <label>
                <span>Новый телефон</span>
                <PhoneInput
                  countryId={phoneCountryId}
                  digits={phoneDigits}
                  name="phone"
                  onCountryChange={setPhoneCountryId}
                  onDigitsChange={setPhoneDigits}
                />
              </label>
            )}
            {message ? <p className="account-form-message account-form-message-error">{message}</p> : null}
            <button className="button" disabled={saving} type="submit">
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function phoneStateFromValue(value: string): { countryId: PhoneCountryId; digits: string } {
  const digits = value.replace(/\D/g, "");
  const country =
    PHONE_COUNTRIES.find((option) => {
      const dialDigits = option.dialCode.replace(/\D/g, "");
      const localDigits = digits.startsWith(dialDigits) ? digits.slice(dialDigits.length) : digits;
      return value.startsWith(option.dialCode) && localDigits.length <= option.nationalLength;
    }) ?? DEFAULT_PHONE_COUNTRY;
  const dialDigits = country.dialCode.replace(/\D/g, "");
  const localDigits = digits.startsWith(dialDigits) ? digits.slice(dialDigits.length) : digits;
  return {
    countryId: country.id as PhoneCountryId,
    digits: localDigits.slice(0, country.nationalLength),
  };
}
