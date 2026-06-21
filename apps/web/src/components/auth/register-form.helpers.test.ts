import { describe, expect, it } from "vitest";
import type { LegalDocumentSummary } from "@ecoplatform/shared";
import {
  areRequiredDocsAccepted,
  buildRegistrationPayload,
  canSubmitRegisterForm,
  formatVerificationExpiresAt,
  getRegisterStepNumber,
  getRegisterSubmitHint,
  getRequiredLegalDocs,
  getVerificationStatusText,
  getVerificationSubmitLabel,
  isVerificationCodeComplete,
} from "./register-form.helpers";
import type { RegisterFormValues } from "./types";

function legalDoc(id: string, isRequired: boolean): LegalDocumentSummary {
  return {
    id,
    type: "privacy_policy",
    version: "1.0.0",
    title: id,
    summary: null,
    isRequired,
    publishedAt: "2026-06-21T10:00:00.000Z",
  };
}

describe("register-form helpers", () => {
  it("builds normalized registration payload", () => {
    const values: RegisterFormValues = {
      organizationName: "  ООО Ромашка  ",
      companyType: "collector",
      lastName: "  Иванов ",
      firstName: " Иван ",
      phoneCountryId: "ru",
      phoneDigits: "9991234567",
      email: " USER@EXAMPLE.COM ",
      password: "strong-pass-1",
    };

    expect(buildRegistrationPayload(values, new Set(["terms", "privacy"]))).toEqual({
      organizationName: "ООО Ромашка",
      companyType: "collector",
      lastName: "Иванов",
      firstName: "Иван",
      phone: "+79991234567",
      email: "user@example.com",
      password: "strong-pass-1",
      acceptedDocumentIds: ["terms", "privacy"],
    });
  });

  it("checks required legal documents only", () => {
    const docs = [legalDoc("required-1", true), legalDoc("optional-1", false), legalDoc("required-2", true)];
    const requiredDocs = getRequiredLegalDocs(docs);

    expect(requiredDocs.map((doc) => doc.id)).toEqual(["required-1", "required-2"]);
    expect(areRequiredDocsAccepted(requiredDocs, new Set(["required-1"]))).toBe(false);
    expect(areRequiredDocsAccepted(requiredDocs, new Set(["required-1", "required-2"]))).toBe(true);
  });

  it("describes submit availability and hint text", () => {
    expect(canSubmitRegisterForm({ legalDocsCount: 0, passwordReady: true, requiredAccepted: true })).toBe(false);
    expect(getRegisterSubmitHint({ legalDocsCount: 0, passwordReady: true, requiredAccepted: true })).toBeNull();
    expect(getRegisterSubmitHint({ legalDocsCount: 2, passwordReady: false, requiredAccepted: false })).toBe(
      "Отметьте обязательные согласия и доведите пароль до зелёного (минимум 12 символов, буква и цифра).",
    );
    expect(getRegisterSubmitHint({ legalDocsCount: 2, passwordReady: true, requiredAccepted: false })).toBe(
      "Отметьте все обязательные согласия, чтобы продолжить.",
    );
    expect(getRegisterSubmitHint({ legalDocsCount: 2, passwordReady: false, requiredAccepted: true })).toBe(
      "Пароль должен стать зелёным: минимум 12 символов, буква и цифра.",
    );
    expect(canSubmitRegisterForm({ legalDocsCount: 2, passwordReady: true, requiredAccepted: true })).toBe(true);
    expect(getRegisterSubmitHint({ legalDocsCount: 2, passwordReady: true, requiredAccepted: true })).toBeNull();
  });

  it("maps step and verification display states", () => {
    expect(getRegisterStepNumber("company")).toBe(1);
    expect(getRegisterStepNumber("person")).toBe(2);
    expect(getRegisterStepNumber("verification")).toBe(3);

    expect(getVerificationStatusText("typing")).toBe("");
    expect(getVerificationStatusText("checking")).toBe("Проверяем код");
    expect(getVerificationStatusText("success")).toBe("Почта подтверждена");
    expect(getVerificationStatusText("error")).toBe("Код не подошёл");

    expect(getVerificationSubmitLabel("typing")).toBe("Подтвердить");
    expect(getVerificationSubmitLabel("checking")).toBe("Проверяем код...");
    expect(getVerificationSubmitLabel("success")).toBe("Готово");
    expect(getVerificationSubmitLabel("error")).toBe("Код не подошёл");
  });

  it("formats verification code state", () => {
    expect(isVerificationCodeComplete("123")).toBe(false);
    expect(isVerificationCodeComplete("1234")).toBe(true);
    expect(formatVerificationExpiresAt(null)).toBe("");
    expect(formatVerificationExpiresAt("2026-06-21T10:05:00")).toBe("10:05");
  });
});
