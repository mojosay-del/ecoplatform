import { MIN_PASSWORD_LENGTH, type LegalDocumentSummary } from "@ecoplatform/shared";
import { VERIFICATION_CODE_LENGTH } from "./constants";
import type { RegisterFormValues, RegisterStep, VerificationPhase } from "./types";
import { formatPhoneFull, getPhoneCountry, normalizeEmailValue } from "./utils";

type RegisterSubmitState = {
  legalDocsCount: number;
  passwordReady: boolean;
  requiredAccepted: boolean;
};

export function getRequiredLegalDocs(legalDocs: LegalDocumentSummary[]) {
  return legalDocs.filter((doc) => doc.isRequired);
}

export function areRequiredDocsAccepted(requiredDocs: LegalDocumentSummary[], acceptedIds: Set<string>) {
  return requiredDocs.every((doc) => acceptedIds.has(doc.id));
}

export function canSubmitRegisterForm({ legalDocsCount, passwordReady, requiredAccepted }: RegisterSubmitState) {
  return legalDocsCount > 0 && requiredAccepted && passwordReady;
}

export function getRegisterSubmitHint({ legalDocsCount, passwordReady, requiredAccepted }: RegisterSubmitState) {
  if (legalDocsCount === 0) return null;

  if (!requiredAccepted && !passwordReady) {
    return `Отметьте обязательные согласия и доведите пароль до зелёного (минимум ${MIN_PASSWORD_LENGTH} символов, буква и цифра).`;
  }

  if (!requiredAccepted) {
    return "Отметьте все обязательные согласия, чтобы продолжить.";
  }

  if (!passwordReady) {
    return `Пароль должен стать зелёным: минимум ${MIN_PASSWORD_LENGTH} символов, буква и цифра.`;
  }

  return null;
}

export function getRegisterStepNumber(step: RegisterStep) {
  return step === "company" ? 1 : step === "person" ? 2 : 3;
}

export function buildRegistrationPayload(values: RegisterFormValues, acceptedIds: Set<string>) {
  const selectedPhoneCountry = getPhoneCountry(values.phoneCountryId);

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

export function formatVerificationExpiresAt(expiresAt?: string | null) {
  return expiresAt ? new Date(expiresAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
}

export function isVerificationCodeComplete(code: string) {
  return code.length === VERIFICATION_CODE_LENGTH;
}

export function getVerificationStatusText(phase: VerificationPhase) {
  if (phase === "checking") return "Проверяем код";
  if (phase === "success") return "Почта подтверждена";
  if (phase === "error") return "Код не подошёл";
  return "";
}

export function getVerificationSubmitLabel(phase: VerificationPhase) {
  if (phase === "checking") return "Проверяем код...";
  if (phase === "success") return "Готово";
  if (phase === "error") return "Код не подошёл";
  return "Подтвердить";
}
