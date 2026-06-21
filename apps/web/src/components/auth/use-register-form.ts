"use client";

import { useRouter } from "next/navigation";
import type { FormEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LegalDocumentSummary } from "@ecoplatform/shared";
import { api, ApiError } from "../../lib/api";
import { useAuth, type RegistrationStartResult } from "../../lib/auth";
import {
  INITIAL_REGISTER_VALUES,
  VERIFICATION_AUTO_SUBMIT_DELAY_MS,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_ERROR_RESET_DELAY_MS,
  VERIFICATION_SUCCESS_REDIRECT_DELAY_MS,
} from "./constants";
import {
  areRequiredDocsAccepted,
  buildRegistrationPayload,
  canSubmitRegisterForm,
  formatVerificationExpiresAt,
  getRegisterStepNumber,
  getRegisterSubmitHint,
  getRequiredLegalDocs,
  getVerificationStatusText,
  isVerificationCodeComplete,
} from "./register-form.helpers";
import type { RegisterFormValues, RegisterStep, SetRegisterField, VerificationPhase } from "./types";
import { emptyVerificationDigits, isPasswordStrong } from "./utils";

export function useRegisterForm() {
  const router = useRouter();
  const { register, resendRegistrationCode, verifyRegistration } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);
  const verificationInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const verificationAttemptRef = useRef(0);
  const verificationResetTimerRef = useRef<number | null>(null);
  const verificationRedirectTimerRef = useRef<number | null>(null);
  const [step, setStep] = useState<RegisterStep>("company");
  const [values, setValues] = useState<RegisterFormValues>(INITIAL_REGISTER_VALUES);
  const [verification, setVerification] = useState<RegistrationStartResult | null>(null);
  const [verificationDigits, setVerificationDigits] = useState<string[]>(emptyVerificationDigits);
  const [verificationPhase, setVerificationPhase] = useState<VerificationPhase>("typing");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendingCode, setResendingCode] = useState(false);
  const [resendStatus, setResendStatus] = useState("");
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

  const requiredDocs = useMemo(() => getRequiredLegalDocs(legalDocs), [legalDocs]);
  const requiredAccepted = areRequiredDocsAccepted(requiredDocs, acceptedIds);
  const passwordReady = isPasswordStrong(values.password);
  const submitState = {
    legalDocsCount: legalDocs.length,
    passwordReady,
    requiredAccepted,
  };
  const canSubmit = canSubmitRegisterForm(submitState);
  const submitHint = getRegisterSubmitHint(submitState);
  const currentStepNumber = getRegisterStepNumber(step);
  const verificationExpiresAt = formatVerificationExpiresAt(verification?.expiresAt);
  const verificationCode = verificationDigits.join("");
  const verificationIsComplete = isVerificationCodeComplete(verificationCode);
  const verificationIsAnimating = verificationPhase !== "typing";
  const verificationInputLocked = verificationIsAnimating || resendingCode || (step === "verification" && submitting);
  const verificationStatusText = getVerificationStatusText(verificationPhase);

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
  }, [step, verification?.verificationId, verificationDigits, verificationPhase]);

  useEffect(() => {
    if (step !== "verification" || verificationPhase !== "typing" || !verification || !verificationIsComplete) return;
    const timerId = window.setTimeout(() => {
      void confirmVerificationCode(verificationCode);
    }, VERIFICATION_AUTO_SUBMIT_DELAY_MS);

    return () => window.clearTimeout(timerId);
    // confirmVerificationCode читает актуальные refs/timers; перезапускать таймер нужно только при смене кода или challenge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, verification?.verificationId, verificationPhase, verificationCode, verificationIsComplete]);

  const setField: SetRegisterField = (field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

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
    setResendStatus("");
    setStep("company");
  }

  function goBackToPersonStep() {
    clearVerificationTimers();
    setError("");
    setResendStatus("");
    setVerificationPhase("typing");
    setStep("person");
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
    setResendStatus("");
    try {
      const result = await register(buildRegistrationPayload(values, acceptedIds));
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
    setResendStatus("");
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

  async function resendVerificationCode() {
    if (!verification || resendingCode) return;

    clearVerificationTimers();
    setError("");
    setResendStatus("");
    setVerificationPhase("typing");
    setResendingCode(true);

    try {
      const result = await resendRegistrationCode({ verificationId: verification.verificationId });
      setVerification(result);
      setVerificationDigits(emptyVerificationDigits());
      setResendStatus("Новый код отправлен.");
      focusVerificationInput(0);
    } catch (err) {
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "Не удалось отправить код повторно. Попробуйте через минуту.",
      );
    } finally {
      setResendingCode(false);
    }
  }

  function setVerificationDigit(index: number, rawValue: string) {
    if (verificationInputLocked) return;

    const digits = rawValue
      .replace(/\D/g, "")
      .slice(0, VERIFICATION_CODE_LENGTH - index)
      .split("");
    setError("");
    setResendStatus("");
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

  return {
    acceptedIds,
    canSubmit,
    currentStepNumber,
    error,
    formRef,
    goBackToCompanyStep,
    goBackToPersonStep,
    goToPersonStep,
    legalDocs,
    legalLoadError,
    onSubmit,
    onVerificationKeyDown,
    registrationOpen,
    requiredDocs,
    resendStatus,
    resendVerificationCode,
    resendingCode,
    setField,
    setVerificationDigit,
    step,
    submitHint,
    submitting,
    toggleAccepted,
    values,
    verification,
    verificationCode,
    verificationDigits,
    verificationExpiresAt,
    verificationInputLocked,
    verificationInputRefs,
    verificationIsAnimating,
    verificationIsComplete,
    verificationPhase,
    verificationStatusText,
  };
}
