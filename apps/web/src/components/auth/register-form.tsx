"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { MIN_PASSWORD_LENGTH, type LegalDocumentSummary } from "@ecoplatform/shared";
import { SendActionIcon } from "../app-shell/nav-icons";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { AuthShell } from "./auth-shell";
import {
  INITIAL_REGISTER_VALUES,
  VERIFICATION_AUTO_SUBMIT_DELAY_MS,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_ERROR_RESET_DELAY_MS,
  VERIFICATION_SUCCESS_REDIRECT_DELAY_MS,
} from "./constants";
import { RegisterStepper } from "./register-stepper";
import { CompanyStepFields, PersonStepFields, VerificationStepFields } from "./register-sections";
import type { RegisterFormValues, RegisterStep, VerificationPhase } from "./types";
import {
  emptyVerificationDigits,
  formatPhoneFull,
  getPhoneCountry,
  isPasswordStrong,
  normalizeEmailValue,
} from "./utils";

export function RegisterForm() {
  const router = useRouter();
  const { register, verifyRegistration } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const verificationInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const verificationAttemptRef = useRef(0);
  const verificationResetTimerRef = useRef<number | null>(null);
  const verificationRedirectTimerRef = useRef<number | null>(null);
  const [step, setStep] = useState<RegisterStep>("company");
  const [values, setValues] = useState<RegisterFormValues>(INITIAL_REGISTER_VALUES);
  const [verification, setVerification] = useState<{ verificationId: string; email: string; expiresAt: string } | null>(
    null,
  );
  const [verificationDigits, setVerificationDigits] = useState<string[]>(emptyVerificationDigits);
  const [verificationPhase, setVerificationPhase] = useState<VerificationPhase>("typing");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [legalDocs, setLegalDocs] = useState<LegalDocumentSummary[]>([]);
  const [legalLoadError, setLegalLoadError] = useState(false);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    api.legal
      .list()
      .then((docs) => {
        if (cancelled) return;
        setLegalDocs(docs);
      })
      .catch(() => {
        if (cancelled) return;
        setLegalLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api.auth
      .registrationStatus()
      .then((status) => {
        if (!cancelled) setRegistrationOpen(status.enabled);
      })
      .catch(() => {
        if (!cancelled) setRegistrationOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requiredDocs = useMemo(() => legalDocs.filter((d) => d.isRequired), [legalDocs]);
  const requiredAccepted = requiredDocs.every((d) => acceptedIds.has(d.id));
  const selectedPhoneCountry = getPhoneCountry(values.phoneCountryId);
  const passwordReady = isPasswordStrong(values.password);
  const canSubmit = legalDocs.length > 0 && requiredAccepted && passwordReady;
  const submitHint =
    legalDocs.length === 0
      ? null
      : !requiredAccepted && !passwordReady
        ? `Отметьте обязательные согласия и доведите пароль до зелёного (минимум ${MIN_PASSWORD_LENGTH} символов, буква и цифра).`
        : !requiredAccepted
          ? "Отметьте все обязательные согласия, чтобы продолжить."
          : !passwordReady
            ? `Пароль должен стать зелёным: минимум ${MIN_PASSWORD_LENGTH} символов, буква и цифра.`
            : null;
  const currentStepNumber = step === "company" ? 1 : step === "person" ? 2 : 3;
  const verificationExpiresAt = verification
    ? new Date(verification.expiresAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "";
  const verificationCode = verificationDigits.join("");
  const verificationIsComplete = verificationCode.length === VERIFICATION_CODE_LENGTH;
  const verificationIsAnimating = verificationPhase !== "typing";
  const verificationInputLocked = verificationIsAnimating || (step === "verification" && submitting);
  const verificationStatusText =
    verificationPhase === "checking"
      ? "Проверяем код"
      : verificationPhase === "success"
        ? "Почта подтверждена"
        : verificationPhase === "error"
          ? "Код не подошёл"
          : "";

  function clearVerificationTimers() {
    if (verificationResetTimerRef.current) {
      window.clearTimeout(verificationResetTimerRef.current);
      verificationResetTimerRef.current = null;
    }
    if (verificationRedirectTimerRef.current) {
      window.clearTimeout(verificationRedirectTimerRef.current);
      verificationRedirectTimerRef.current = null;
    }
  }

  function focusVerificationInput(index: number) {
    window.setTimeout(() => verificationInputRefs.current[index]?.focus(), 0);
  }

  useEffect(() => {
    return () => clearVerificationTimers();
  }, []);

  useEffect(() => {
    if (step !== "verification" || verificationPhase !== "typing") return;
    const firstEmptyIndex = verificationDigits.findIndex((digit) => digit === "");
    focusVerificationInput(firstEmptyIndex === -1 ? VERIFICATION_CODE_LENGTH - 1 : firstEmptyIndex);
  }, [step, verification?.verificationId]);

  useEffect(() => {
    if (step !== "verification" || verificationPhase !== "typing" || !verification || !verificationIsComplete) return;
    const timerId = window.setTimeout(() => {
      void confirmVerificationCode(verificationCode);
    }, VERIFICATION_AUTO_SUBMIT_DELAY_MS);

    return () => window.clearTimeout(timerId);
  }, [step, verification?.verificationId, verificationPhase, verificationCode, verificationIsComplete]);

  function setField<K extends keyof RegisterFormValues>(field: K, value: RegisterFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function toggleAccepted(id: string) {
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function goToPersonStep() {
    setError("");
    if (formRef.current?.reportValidity()) {
      setStep("person");
    }
  }

  function goBackToCompanyStep() {
    setError("");
    setStep("company");
  }

  function registrationPayload() {
    return {
      organizationName: values.organizationName.trim(),
      companyType: values.companyType,
      lastName: values.lastName.trim(),
      firstName: values.firstName.trim(),
      phone: formatPhoneFull(selectedPhoneCountry, values.phoneDigits),
      email: normalizeEmailValue(values.email),
      password: values.password,
      acceptedDocumentIds: Array.from(acceptedIds),
    };
  }

  async function requestVerificationCode() {
    if (!passwordReady) {
      setError("Пароль должен стать зелёным: минимум 12 символов, буква и цифра.");
      return;
    }

    if (!requiredAccepted) {
      setError("Отметьте все обязательные согласия.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await register(registrationPayload());
      clearVerificationTimers();
      setVerification(result);
      setVerificationDigits(emptyVerificationDigits());
      setVerificationPhase("typing");
      setStep("verification");
    } catch (err) {
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "Не удалось отправить код. Возможно, email или телефон уже используются.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (step === "company") {
      goToPersonStep();
      return;
    }

    if (step === "person") {
      await requestVerificationCode();
      return;
    }

    if (!verification) {
      setStep("person");
      return;
    }

    if (verificationPhase !== "typing") {
      return;
    }

    if (!verificationIsComplete) {
      setError("Введите 4 цифры из письма.");
      return;
    }

    await confirmVerificationCode(verificationCode);
  }

  async function confirmVerificationCode(code: string) {
    if (!verification || verificationPhase !== "typing" || !/^\d{4}$/.test(code)) return;

    const attempt = verificationAttemptRef.current + 1;
    verificationAttemptRef.current = attempt;
    clearVerificationTimers();
    setSubmitting(true);
    setError("");
    setVerificationPhase("checking");

    try {
      await verifyRegistration({ verificationId: verification.verificationId, code });
      if (verificationAttemptRef.current !== attempt) return;
      setVerificationPhase("success");
      verificationRedirectTimerRef.current = window.setTimeout(() => {
        router.push("/news");
      }, VERIFICATION_SUCCESS_REDIRECT_DELAY_MS);
    } catch (err) {
      if (verificationAttemptRef.current !== attempt) return;
      setVerificationPhase("error");
      setError(err instanceof ApiError && err.message ? err.message : "Не удалось подтвердить почту.");
      verificationResetTimerRef.current = window.setTimeout(() => {
        if (verificationAttemptRef.current !== attempt) return;
        setVerificationDigits(emptyVerificationDigits());
        setVerificationPhase("typing");
        setSubmitting(false);
        focusVerificationInput(0);
      }, VERIFICATION_ERROR_RESET_DELAY_MS);
    }
  }

  function setVerificationDigit(index: number, rawValue: string) {
    if (verificationInputLocked) return;

    const digits = rawValue
      .replace(/\D/g, "")
      .slice(0, VERIFICATION_CODE_LENGTH - index)
      .split("");
    setError("");
    setVerificationDigits((current) => {
      const next = [...current];
      if (digits.length === 0) {
        next[index] = "";
        return next;
      }

      digits.forEach((digit, offset) => {
        next[index + offset] = digit;
      });

      const nextEmptyIndex = next.findIndex((digit, digitIndex) => digitIndex > index && digit === "");
      if (nextEmptyIndex !== -1) {
        focusVerificationInput(nextEmptyIndex);
      } else {
        focusVerificationInput(Math.min(index + digits.length, VERIFICATION_CODE_LENGTH - 1));
      }

      return next;
    });
  }

  function onVerificationKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (verificationInputLocked) return;

    if (event.key === "Backspace" && verificationDigits[index] === "" && index > 0) {
      event.preventDefault();
      setVerificationDigits((current) => {
        const next = [...current];
        next[index - 1] = "";
        return next;
      });
      focusVerificationInput(index - 1);
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusVerificationInput(index - 1);
      return;
    }

    if (event.key === "ArrowRight" && index < VERIFICATION_CODE_LENGTH - 1) {
      event.preventDefault();
      focusVerificationInput(index + 1);
    }
  }

  if (registrationOpen === false) {
    return (
      <AuthShell mode="register">
        <div className="auth-card auth-card-wide auth-closed">
          <span className="auth-closed-badge" aria-hidden="true">
            <Lock size={28} strokeWidth={1.75} />
          </span>
          <span className="auth-closed-pill">
            <span className="auth-closed-pill-dot" aria-hidden="true" />
            Скоро откроется
          </span>
          <header className="auth-card-head">
            <h1 className="auth-card-title">Регистрация закрыта</h1>
            <p className="auth-card-sub">
              Регистрация новых пользователей временно отключена. Загляните чуть позже — мы готовим место для новых
              компаний.
            </p>
          </header>
          <Link className="button auth-submit auth-closed-cta" href="/login">
            Войти в аккаунт
          </Link>
          <p className="auth-card-sub auth-closed-foot">Уже есть аккаунт? Войдите по кнопке выше.</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell mode="register">
      <form
        ref={formRef}
        className={`auth-card form auth-card-wide${step === "verification" ? " auth-card-verification" : ""}`}
        onSubmit={onSubmit}
      >
        {step !== "verification" ? (
          <header className="auth-card-head">
            <h1 className="auth-card-title">Создать аккаунт</h1>
            <p className="auth-card-sub">
              Пробный доступ на 24 часа · <Link href="/login">Уже есть аккаунт</Link>
            </p>
          </header>
        ) : null}

        <RegisterStepper current={currentStepNumber} />

        {step === "company" ? (
          <CompanyStepFields values={values} setField={setField} />
        ) : step === "person" ? (
          <PersonStepFields
            acceptedIds={acceptedIds}
            legalDocs={legalDocs}
            legalLoadError={legalLoadError}
            requiredDocs={requiredDocs}
            setField={setField}
            toggleAccepted={toggleAccepted}
            values={values}
          />
        ) : (
          <VerificationStepFields
            onVerificationKeyDown={onVerificationKeyDown}
            setVerificationDigit={setVerificationDigit}
            valuesEmail={values.email}
            verificationCode={verificationCode}
            verificationDigits={verificationDigits}
            verificationEmail={verification?.email}
            verificationExpiresAt={verificationExpiresAt}
            verificationInputLocked={verificationInputLocked}
            verificationInputRefs={verificationInputRefs}
            verificationIsAnimating={verificationIsAnimating}
            verificationPhase={verificationPhase}
            verificationStatusText={verificationStatusText}
          />
        )}

        {error ? <p className="auth-error">{error}</p> : null}

        {step === "company" ? (
          <button className="button auth-submit" type="button" onClick={goToPersonStep}>
            Далее
          </button>
        ) : step === "person" ? (
          <>
            <div className="auth-step-actions">
              <button className="button secondary" type="button" onClick={goBackToCompanyStep} disabled={submitting}>
                Назад
              </button>
              <button className="button auth-submit" type="submit" disabled={submitting || !canSubmit}>
                {submitting ? (
                  <>
                    <span className="auth-btn-spinner" aria-hidden="true" />
                    Отправляем код…
                  </>
                ) : (
                  "Создать аккаунт"
                )}
              </button>
            </div>
            {!canSubmit && submitHint ? <p className="auth-submit-hint">{submitHint}</p> : null}
            <p className="auth-secure-note">
              <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
              Соединение защищено
            </p>
          </>
        ) : (
          <div className="auth-verification-actions">
            <button
              className="button auth-submit auth-verification-submit"
              type="submit"
              disabled={verificationInputLocked || !verificationIsComplete}
            >
              {verificationPhase === "checking"
                ? "Проверяем код..."
                : verificationPhase === "success"
                  ? "Готово"
                  : verificationPhase === "error"
                    ? "Код не подошёл"
                    : "Подтвердить"}
            </button>
            <div className="auth-verification-secondary">
              <button
                className="auth-text-button"
                type="button"
                onClick={() => {
                  clearVerificationTimers();
                  setError("");
                  setVerificationPhase("typing");
                  setStep("person");
                }}
                disabled={submitting}
              >
                Назад
              </button>
              <button
                className="auth-text-button"
                type="button"
                onClick={requestVerificationCode}
                disabled={submitting}
              >
                <SendActionIcon size={16} />
                Отправить код ещё раз
              </button>
            </div>
          </div>
        )}
      </form>
    </AuthShell>
  );
}
