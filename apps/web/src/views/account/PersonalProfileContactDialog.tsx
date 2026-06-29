import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Check, Mail, X } from "lucide-react";
import {
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
import { errorText, api } from "../../lib/api";
import { useAccountDialogBodyLock } from "./hooks";
import type { ContactField } from "./personal-profile-options";
import { phoneStateFromValue } from "./personal-profile-utils";

type EmailChangeStepId = "currentCode" | "newEmail" | "newCode";

const EMAIL_CHANGE_STEPS: Array<{ id: EmailChangeStepId; label: string }> = [
  { id: "currentCode", label: "Текущий email" },
  { id: "newEmail", label: "Новый email" },
  { id: "newCode", label: "Подтверждение" },
];

export function ContactChangeDialog({
  currentValue,
  field,
  onClose,
  onSaved,
}: {
  currentValue: string;
  field: ContactField;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [verification, setVerification] = useState<{ verificationId: string; email: string; expiresAt: string } | null>(
    null,
  );
  // M-9: для email после ввода нового адреса появляется второй код — на новый
  // адрес. newVerification хранит адрес/срок нового кода (verificationId — общий).
  const [newVerification, setNewVerification] = useState<{ email: string; expiresAt: string } | null>(null);
  const [step, setStep] = useState<"code" | "edit" | "newCode">("code");
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
  const isCodeStep = step === "code" || step === "newCode";
  // На шаге newCode код и срок относятся к новому адресу, иначе — к текущему.
  const activeCodeTarget = step === "newCode" ? newVerification : verification;
  const expiresAt = activeCodeTarget
    ? new Date(activeCodeTarget.expiresAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "";
  const contactTitle = field === "email" ? "email" : "телефона";
  const emailStep: EmailChangeStepId = step === "code" ? "currentCode" : step === "edit" ? "newEmail" : "newCode";

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
      setMessage(errorText(error, "Не удалось отправить код."));
    } finally {
      if (requestIdRef.current === requestId) setRequesting(false);
    }
  }, [clearTimers, field]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  useEffect(() => {
    if (!isCodeStep || !verification || phase !== "typing" || !codeComplete) return;
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
      if (step === "newCode") {
        // M-9: подтверждаем владение новым email — после успеха адрес применён.
        await api.account.confirmContactChange({ verificationId: verification.verificationId, code: nextCode });
        if (attemptRef.current !== attempt) return;
        setPhase("success");
        successTimerRef.current = window.setTimeout(() => {
          if (attemptRef.current !== attempt) return;
          void onSaved().finally(onClose);
        }, VERIFICATION_SUCCESS_REDIRECT_DELAY_MS);
        return;
      }
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
      setMessage(errorText(error, "Код не подошёл."));
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

  function enterNewCodeStep(newEmail: string, newExpiresAt: string) {
    clearTimers();
    attemptRef.current += 1; // обнуляем любые незавершённые проверки старого кода
    setNewVerification({ email: newEmail, expiresAt: newExpiresAt });
    setCodeDigits(emptyVerificationDigits());
    setPhase("typing");
    setMessage(null);
    setStep("newCode");
    window.setTimeout(() => inputRefs.current[0]?.focus(), 0);
  }

  async function onSubmitNewValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verification) return;

    setSaving(true);
    setMessage(null);
    try {
      if (field === "email") {
        // M-9: apply не применяет адрес — отправляет код на новый email и просит
        // подтвердить владение им (шаг newCode).
        const result = await api.account.applyContactChange({
          field,
          verificationId: verification.verificationId,
          email: normalizeEmailValue(emailValue),
        });
        if (result.requiresNewCode) {
          enterNewCodeStep(result.email, result.expiresAt);
          return;
        }
        await onSaved();
        onClose();
        return;
      }
      const phone = formatPhoneFull(getPhoneCountry(phoneCountryId), phoneDigits);
      if (!phone) {
        setMessage("Введите полный номер телефона.");
        return;
      }
      await api.account.applyContactChange({ field, verificationId: verification.verificationId, phone });
      await onSaved();
      onClose();
    } catch (error) {
      setMessage(errorText(error, "Не удалось сохранить новое значение."));
    } finally {
      setSaving(false);
    }
  }

  // M-9: переотправка кода на новый email (повторный apply тем же значением).
  async function resendNewCode() {
    if (!verification || field !== "email") return;
    setRequesting(true);
    setMessage(null);
    try {
      const result = await api.account.applyContactChange({
        field: "email",
        verificationId: verification.verificationId,
        email: normalizeEmailValue(emailValue),
      });
      if (result.requiresNewCode) {
        clearTimers();
        attemptRef.current += 1;
        setNewVerification({ email: result.email, expiresAt: result.expiresAt });
        setCodeDigits(emptyVerificationDigits());
        setPhase("typing");
        window.setTimeout(() => inputRefs.current[0]?.focus(), 0);
      }
    } catch (error) {
      setMessage(errorText(error, "Не удалось отправить код."));
    } finally {
      setRequesting(false);
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по фону — мышиное удобство; с клавиатуры окно закрывается кнопкой закрытия и Escape
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
            <p>
              {field === "email"
                ? step === "newCode"
                  ? "Финальный код подтвердит, что новый email принадлежит вам."
                  : step === "edit"
                    ? "Укажите новый адрес, и мы отправим на него второй код."
                    : "Сначала подтвердите доступ к текущему email аккаунта."
                : "Код будет отправлен на текущий email аккаунта."}
            </p>
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
        {isCodeStep ? (
          <div className="account-contact-modal-body">
            {field === "email" ? <EmailChangeSteps activeStep={emailStep} /> : null}
            <div className="account-contact-panel account-contact-code-head">
              <span className="account-contact-code-icon" aria-hidden="true">
                <Mail size={22} />
              </span>
              <div>
                <strong>
                  {requesting
                    ? "Отправляем код..."
                    : step === "newCode"
                      ? "Введите код с нового адреса"
                      : verification
                        ? "Введите код из письма"
                        : "Отправьте код"}
                </strong>
                <p>
                  {step === "newCode" && newVerification
                    ? `Письмо с кодом отправлено на ${newVerification.email}, код действует до ${expiresAt}.`
                    : verification
                      ? `Письмо отправлено на ${verification.email}, код действует до ${expiresAt}.`
                      : requesting
                        ? "Подготавливаем письмо с кодом подтверждения."
                        : "Код придёт на текущий email аккаунта после нажатия на кнопку."}
                </p>
                {activeCodeTarget ? <span className="account-contact-target">Код действует до {expiresAt}</span> : null}
              </div>
            </div>
            {verification ? (
              <div className={`otp-stage is-${phase}`} aria-busy={phase === "checking"} data-phase={phase}>
                <div className="otp-digits" aria-hidden={phase !== "typing"}>
                  {codeDigits.map((digit, index) => (
                    <input
                      aria-label={`Цифра ${index + 1} из ${VERIFICATION_CODE_LENGTH}`}
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                      className={`otp-box${digit ? " is-filled" : ""}`}
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
                <div className="otp-orb" aria-hidden={phase === "typing"}>
                  {phase === "checking" ? <span className="otp-spinner" /> : null}
                  {phase === "success" ? <Check size={34} strokeWidth={3} aria-hidden="true" /> : null}
                  {phase === "error" ? <X size={34} strokeWidth={3} aria-hidden="true" /> : null}
                </div>
              </div>
            ) : null}
            {message ? (
              <p className="account-form-message account-form-message-error" role="status">
                {message}
              </p>
            ) : null}
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
                    onClick={() => void (step === "newCode" ? resendNewCode() : requestCode())}
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
          <form
            className="account-form account-password-modal-form account-contact-edit-form"
            onSubmit={onSubmitNewValue}
          >
            {field === "email" ? (
              <>
                <EmailChangeSteps activeStep={emailStep} />
                <div className="account-contact-panel account-contact-edit-note">
                  <span className="account-contact-code-icon" aria-hidden="true">
                    <Mail size={22} />
                  </span>
                  <div>
                    <strong>Новый адрес для входа</strong>
                    <p>После сохранения отправим код на новый email. Адрес изменится только после подтверждения.</p>
                  </div>
                </div>
              </>
            ) : null}
            {field === "email" ? (
              <label>
                <span>Новый email</span>
                {/* eslint-disable jsx-a11y/no-autofocus -- автофокус первого поля переносит фокус в модалку при открытии (корректно для диалога) */}
                <input
                  autoFocus
                  autoComplete="email"
                  className="input"
                  onChange={(event) => setEmailValue(event.currentTarget.value)}
                  required
                  type="email"
                  value={emailValue}
                />
                {/* eslint-enable jsx-a11y/no-autofocus */}
              </label>
            ) : (
              // eslint-disable-next-line jsx-a11y/label-has-associated-control -- подпись поля; PhoneInput самоозначивает свои поля
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
            {message ? (
              <p className="account-form-message account-form-message-error" role="status">
                {message}
              </p>
            ) : null}
            <button className="button" disabled={saving} type="submit">
              {saving ? "Сохраняем..." : "Сохранить"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function EmailChangeSteps({ activeStep }: { activeStep: EmailChangeStepId }) {
  const activeIndex = EMAIL_CHANGE_STEPS.findIndex((item) => item.id === activeStep);

  return (
    <div className="account-contact-steps" aria-label="Шаги смены email">
      {EMAIL_CHANGE_STEPS.map((item, index) => (
        <span
          className={`account-contact-step${index < activeIndex ? " is-done" : ""}${item.id === activeStep ? " is-active" : ""}`}
          key={item.id}
        >
          <span className="account-contact-step-index">{index + 1}</span>
          <span>{item.label}</span>
        </span>
      ))}
    </div>
  );
}
