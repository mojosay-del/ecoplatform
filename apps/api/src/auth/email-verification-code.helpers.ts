import { createHmac, randomInt, timingSafeEqual } from "crypto";

export const EMAIL_VERIFICATION_TTL_MS = 15 * 60 * 1000;
export const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

export function generateEmailVerificationCode(): string {
  const fixedCode = process.env.EMAIL_VERIFICATION_TEST_CODE;
  if (fixedCode && process.env.NODE_ENV !== "production") {
    if (!/^\d{4}$/.test(fixedCode)) {
      throw new Error("EMAIL_VERIFICATION_TEST_CODE должен состоять из 4 цифр.");
    }
    return fixedCode;
  }
  if (fixedCode && process.env.NODE_ENV === "production") {
    throw new Error("EMAIL_VERIFICATION_TEST_CODE нельзя использовать в production.");
  }
  return randomInt(0, 10_000).toString().padStart(4, "0");
}

export function hashEmailVerificationCode(verificationId: string, email: string, code: string): string {
  return createHmac("sha256", emailVerificationSecret()).update(`${verificationId}:${email}:${code}`).digest("hex");
}

export function emailVerificationCodeMatches(
  verificationId: string,
  email: string,
  code: string,
  storedHash: string,
): boolean {
  const expectedHash = hashEmailVerificationCode(verificationId, email, code);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(storedHash, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function emailVerificationSecret(): string {
  const secret = process.env.EMAIL_VERIFICATION_SECRET ?? process.env.JWT_ACCESS_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("EMAIL_VERIFICATION_SECRET или JWT_ACCESS_SECRET должен быть не короче 32 символов.");
  }
  return secret;
}
