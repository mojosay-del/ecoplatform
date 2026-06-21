"use client";

import { SendActionIcon } from "../app-shell/nav-icons";
import { getVerificationSubmitLabel } from "./register-form.helpers";
import type { VerificationPhase } from "./types";

const REGISTRATION_TRUST_ITEMS = ["Соответствие 152-ФЗ", "Защищённое соединение", "Регистрация за пару минут"] as const;

export function CompanyStepActions({ onNext }: { onNext: () => void }) {
  return (
    <button className="button form-submit" type="button" onClick={onNext}>
      Далее
    </button>
  );
}

export function PersonStepActions({
  canSubmit,
  onBack,
  submitHint,
  submitting,
}: {
  canSubmit: boolean;
  onBack: () => void;
  submitHint: string | null;
  submitting: boolean;
}) {
  return (
    <>
      <div className="auth-step-actions">
        <button className="button secondary" type="button" onClick={onBack} disabled={submitting}>
          Назад
        </button>
        <button className="button form-submit" type="submit" disabled={submitting || !canSubmit}>
          {submitting ? (
            <>
              <span className="form-btn-spinner" aria-hidden="true" />
              Отправляем код…
            </>
          ) : (
            "Создать аккаунт"
          )}
        </button>
      </div>
      {!canSubmit && submitHint ? <p className="form-submit-hint">{submitHint}</p> : null}
      <ul className="form-inline-trust" aria-label="Гарантии регистрации">
        {REGISTRATION_TRUST_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

export function VerificationStepActions({
  onBack,
  onResend,
  resendingCode,
  submitting,
  verificationInputLocked,
  verificationIsComplete,
  verificationPhase,
}: {
  onBack: () => void;
  onResend: () => void;
  resendingCode: boolean;
  submitting: boolean;
  verificationInputLocked: boolean;
  verificationIsComplete: boolean;
  verificationPhase: VerificationPhase;
}) {
  return (
    <div className="auth-verification-actions">
      <button
        className="button form-submit auth-verification-submit"
        type="submit"
        disabled={verificationInputLocked || !verificationIsComplete}
      >
        {getVerificationSubmitLabel(verificationPhase)}
      </button>
      <div className="auth-verification-secondary">
        <button className="form-text-button" type="button" onClick={onBack} disabled={submitting}>
          Назад
        </button>
        <button className="form-text-button" type="button" onClick={onResend} disabled={submitting || resendingCode}>
          <SendActionIcon size={16} />
          {resendingCode ? "Отправляем..." : "Отправить код ещё раз"}
        </button>
      </div>
    </div>
  );
}
