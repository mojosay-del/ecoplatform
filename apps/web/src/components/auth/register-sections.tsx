"use client";

import type { KeyboardEvent, MutableRefObject } from "react";
import { Building2, Check, Mail, Tag, User, X } from "lucide-react";
import { MIN_PASSWORD_LENGTH, type LegalDocumentSummary } from "@ecoplatform/shared";
import { companyTypeOptions, VERIFICATION_CODE_LENGTH } from "./constants";
import { AuthSelect } from "./auth-select";
import { ConsentRow } from "./consent-row";
import {
  AuthField,
  EmailInput,
  FieldAffix,
  OrganizationNameInput,
  PasswordInput,
  PasswordStrengthMeter,
} from "./fields";
import { PhoneInput } from "./phone-input";
import type { PhoneCountryId, RegisterFormValues, VerificationPhase } from "./types";
import { normalizeEmailValue } from "./utils";

type SetRegisterField = <K extends keyof RegisterFormValues>(field: K, value: RegisterFormValues[K]) => void;

export function CompanyStepFields({ values, setField }: { values: RegisterFormValues; setField: SetRegisterField }) {
  return (
    <div className="auth-section">
      <AuthField label="Наименование компании">
        <FieldAffix icon={Building2}>
          <OrganizationNameInput
            value={values.organizationName}
            onValueChange={(value) => setField("organizationName", value)}
          />
        </FieldAffix>
      </AuthField>
      <div className="auth-field">
        <span className="auth-field-label">Тип компании</span>
        <AuthSelect
          icon={Tag}
          label="Тип компании"
          name="companyType"
          value={values.companyType}
          options={companyTypeOptions}
          onChange={(value) => setField("companyType", value)}
        />
      </div>
    </div>
  );
}

export function PersonStepFields({
  acceptedIds,
  legalDocs,
  legalLoadError,
  requiredDocs,
  setField,
  toggleAccepted,
  values,
}: {
  acceptedIds: Set<string>;
  legalDocs: LegalDocumentSummary[];
  legalLoadError: boolean;
  requiredDocs: LegalDocumentSummary[];
  setField: SetRegisterField;
  toggleAccepted: (id: string) => void;
  values: RegisterFormValues;
}) {
  return (
    <>
      <fieldset className="auth-section">
        <legend className="auth-section-title">О вас</legend>
        <div className="auth-grid-2">
          <AuthField label="Фамилия">
            <FieldAffix icon={User}>
              <input
                className="input auth-input-leading"
                name="lastName"
                value={values.lastName}
                onChange={(event) => setField("lastName", event.currentTarget.value)}
                required
              />
            </FieldAffix>
          </AuthField>
          <AuthField label="Имя">
            <FieldAffix icon={User}>
              <input
                className="input auth-input-leading"
                name="firstName"
                value={values.firstName}
                onChange={(event) => setField("firstName", event.currentTarget.value)}
                required
              />
            </FieldAffix>
          </AuthField>
        </div>
        <AuthField label="Телефон">
          <PhoneInput
            name="phone"
            countryId={values.phoneCountryId}
            digits={values.phoneDigits}
            onCountryChange={(countryId: PhoneCountryId) => setField("phoneCountryId", countryId)}
            onDigitsChange={(digits) => setField("phoneDigits", digits)}
          />
        </AuthField>
      </fieldset>

      <fieldset className="auth-section">
        <legend className="auth-section-title">Доступ</legend>
        <div className="auth-grid-2">
          <AuthField label="Email">
            <EmailInput
              name="email"
              autoComplete="email"
              value={values.email}
              onValueChange={(value) => setField("email", value)}
            />
          </AuthField>
          <AuthField label="Пароль">
            <PasswordInput
              name="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              value={values.password}
              onValueChange={(value) => setField("password", value)}
            />
            <PasswordStrengthMeter password={values.password} />
          </AuthField>
        </div>
      </fieldset>

      <fieldset className="auth-section">
        <legend className="auth-section-title">Согласия</legend>
        {legalLoadError ? (
          <p className="auth-error">Не удалось загрузить юридические документы. Обновите страницу.</p>
        ) : legalDocs.length === 0 ? (
          <p className="auth-card-sub">Загружаем актуальные документы…</p>
        ) : (
          <div className="consent-list">
            {requiredDocs.map((doc) => (
              <ConsentRow
                key={doc.id}
                document={doc}
                checked={acceptedIds.has(doc.id)}
                onChange={() => toggleAccepted(doc.id)}
                required
              />
            ))}
          </div>
        )}
      </fieldset>
    </>
  );
}

export function VerificationStepFields({
  onVerificationKeyDown,
  setVerificationDigit,
  valuesEmail,
  verificationCode,
  verificationDigits,
  verificationEmail,
  verificationExpiresAt,
  verificationInputLocked,
  verificationInputRefs,
  verificationIsAnimating,
  verificationPhase,
  verificationStatusText,
}: {
  onVerificationKeyDown: (index: number, event: KeyboardEvent<HTMLInputElement>) => void;
  setVerificationDigit: (index: number, rawValue: string) => void;
  valuesEmail: string;
  verificationCode: string;
  verificationDigits: string[];
  verificationEmail?: string;
  verificationExpiresAt: string;
  verificationInputLocked: boolean;
  verificationInputRefs: MutableRefObject<Array<HTMLInputElement | null>>;
  verificationIsAnimating: boolean;
  verificationPhase: VerificationPhase;
  verificationStatusText: string;
}) {
  return (
    <fieldset className="auth-section auth-verification-section">
      <legend className="auth-section-title auth-verification-title">
        <span className="auth-verification-badge" aria-hidden="true">
          <Mail size={26} strokeWidth={2} />
        </span>
        <span>Подтвердите почту</span>
      </legend>
      <p className="auth-card-sub auth-verification-copy">
        Код отправлен на {verificationEmail ?? normalizeEmailValue(valuesEmail)}
        {verificationExpiresAt ? `, действует до ${verificationExpiresAt}.` : "."}
      </p>
      <p className="auth-verification-hint">Не пришёл код? Проверьте папку «Спам» — иногда письмо попадает туда.</p>
      <div
        className={`auth-code-stage is-${verificationPhase}`}
        aria-busy={verificationPhase === "checking"}
        data-phase={verificationPhase}
      >
        <div className="auth-code-digits" aria-hidden={verificationIsAnimating}>
          {verificationDigits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                verificationInputRefs.current[index] = element;
              }}
              className={`auth-code-box${digit ? " is-filled" : ""}`}
              type="text"
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              aria-label={`Цифра ${index + 1} из ${VERIFICATION_CODE_LENGTH}`}
              pattern="[0-9]"
              maxLength={VERIFICATION_CODE_LENGTH}
              value={digit}
              onChange={(event) => setVerificationDigit(index, event.currentTarget.value)}
              onKeyDown={(event) => onVerificationKeyDown(index, event)}
              disabled={verificationInputLocked}
              required
            />
          ))}
        </div>
        <div className="auth-code-orb" aria-hidden={!verificationIsAnimating}>
          {verificationPhase === "checking" ? <span className="auth-code-spinner" /> : null}
          {verificationPhase === "success" ? <Check size={34} strokeWidth={3} aria-hidden="true" /> : null}
          {verificationPhase === "error" ? <X size={34} strokeWidth={3} aria-hidden="true" /> : null}
        </div>
      </div>
      <input type="hidden" name="emailCode" value={verificationCode} />
      <span className="auth-sr-only" aria-live="polite">
        {verificationStatusText}
      </span>
    </fieldset>
  );
}
