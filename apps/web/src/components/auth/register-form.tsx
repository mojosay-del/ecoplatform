"use client";

import Link from "next/link";
import { AuthShell } from "./auth-shell";
import { RegisterClosedCard } from "./register-closed-card";
import { CompanyStepActions, PersonStepActions, VerificationStepActions } from "./register-form-actions";
import { RegisterStepper } from "./register-stepper";
import { CompanyStepFields, PersonStepFields, VerificationStepFields } from "./register-sections";
import { useRegisterForm } from "./use-register-form";

export function RegisterForm() {
  const form = useRegisterForm();

  if (form.registrationOpen === false) {
    return (
      <AuthShell mode="register">
        <RegisterClosedCard />
      </AuthShell>
    );
  }

  return (
    <AuthShell mode="register">
      <form
        ref={form.formRef}
        className={`ui-card form ui-card-wide${form.step === "verification" ? " ui-card-verification" : ""}`}
        onSubmit={form.onSubmit}
      >
        {form.step !== "verification" ? (
          <header className="ui-card-head">
            <h1 className="ui-card-title">Создать аккаунт</h1>
            <p className="ui-card-sub">
              Пробный доступ на 24 часа · <Link href="/login">Уже есть аккаунт</Link>
            </p>
          </header>
        ) : null}

        <RegisterStepper current={form.currentStepNumber} />

        {form.step === "company" ? (
          <CompanyStepFields values={form.values} setField={form.setField} />
        ) : form.step === "person" ? (
          <PersonStepFields
            acceptedIds={form.acceptedIds}
            legalDocs={form.legalDocs}
            legalLoadError={form.legalLoadError}
            requiredDocs={form.requiredDocs}
            setField={form.setField}
            toggleAccepted={form.toggleAccepted}
            values={form.values}
          />
        ) : (
          <VerificationStepFields
            onVerificationKeyDown={form.onVerificationKeyDown}
            setVerificationDigit={form.setVerificationDigit}
            valuesEmail={form.values.email}
            verificationCode={form.verificationCode}
            verificationDigits={form.verificationDigits}
            verificationEmail={form.verification?.email}
            verificationExpiresAt={form.verificationExpiresAt}
            verificationInputLocked={form.verificationInputLocked}
            verificationInputRefs={form.verificationInputRefs}
            verificationIsAnimating={form.verificationIsAnimating}
            verificationPhase={form.verificationPhase}
            verificationStatusText={form.verificationStatusText}
          />
        )}

        {form.step === "verification" && form.resendStatus ? (
          <p className="auth-verification-resend-status" role="status">
            {form.resendStatus}
          </p>
        ) : null}

        {form.error ? <p className="form-error">{form.error}</p> : null}

        {form.step === "company" ? (
          <CompanyStepActions onNext={form.goToPersonStep} />
        ) : form.step === "person" ? (
          <PersonStepActions
            canSubmit={form.canSubmit}
            onBack={form.goBackToCompanyStep}
            submitHint={form.submitHint}
            submitting={form.submitting}
          />
        ) : (
          <VerificationStepActions
            onBack={form.goBackToPersonStep}
            onResend={form.resendVerificationCode}
            resendingCode={form.resendingCode}
            submitting={form.submitting}
            verificationInputLocked={form.verificationInputLocked}
            verificationIsComplete={form.verificationIsComplete}
            verificationPhase={form.verificationPhase}
          />
        )}
      </form>
    </AuthShell>
  );
}
