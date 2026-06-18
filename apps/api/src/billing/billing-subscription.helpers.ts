import { BadRequestException, ConflictException } from "@nestjs/common";
import { createHash } from "crypto";
import { CompanyStatus, Prisma } from "@prisma/client";
import type { Company, Subscription } from "@prisma/client";
import type { BillingTrialActivationResponse, ManualSubscriptionDto, SelfSubscriptionDto } from "@ecoplatform/shared";

export type ManualSubscriptionResponse = {
  company: ReturnType<typeof serializeCompany>;
  subscription: ReturnType<typeof serializeSubscription>;
};

export type TrialActivationResponse = BillingTrialActivationResponse;

export function normalizeIdempotencyKey(key: string | undefined): string {
  const normalized = key?.trim();

  if (!normalized) {
    throw new BadRequestException("Idempotency-Key обязателен для активации подписки.");
  }

  if (normalized.length < 8 || normalized.length > 128) {
    throw new BadRequestException("Idempotency-Key должен быть от 8 до 128 символов.");
  }

  if (!/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new BadRequestException("Idempotency-Key содержит недопустимые символы.");
  }

  return normalized;
}

export function hashManualSubscriptionRequest(input: ManualSubscriptionDto): string {
  return createHash("sha256")
    .update(
      stableStringify({
        companyId: input.companyId,
        endsAt: new Date(input.endsAt).toISOString(),
        plan: input.plan,
        reason: input.reason,
      }),
    )
    .digest("hex");
}

export function hashSelfSubscriptionRequest(input: SelfSubscriptionDto, companyId: string): string {
  return createHash("sha256")
    .update(
      stableStringify({
        companyId,
        plan: input.plan,
      }),
    )
    .digest("hex");
}

export function hashTrialActivationRequest(companyId: string): string {
  return createHash("sha256")
    .update(
      stableStringify({
        companyId,
        source: "subscription_page",
      }),
    )
    .digest("hex");
}

export function replayManualSubscription(
  existing: { requestHash: string; response: Prisma.JsonValue | null },
  requestHash: string,
): ManualSubscriptionResponse {
  return replayStoredResponse<ManualSubscriptionResponse>(existing, requestHash);
}

export function replayStoredResponse<T>(
  existing: { requestHash: string; response: Prisma.JsonValue | null },
  requestHash: string,
): T {
  if (existing.requestHash !== requestHash) {
    throw new ConflictException("Idempotency-Key уже использован с другим payload.");
  }

  if (!existing.response) {
    throw new ConflictException("Запрос с этим Idempotency-Key ещё обрабатывается. Повторите позже.");
  }

  return existing.response as unknown as T;
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function serializeCompany(company: Company) {
  return {
    id: company.id,
    organizationName: company.organizationName,
    type: company.type,
    status: company.status,
    demoEndsAt: company.demoEndsAt?.toISOString() ?? null,
    subscriptionPlan: company.subscriptionPlan,
    subscriptionEndsAt: company.subscriptionEndsAt?.toISOString() ?? null,
    billingInn: company.billingInn,
    billingKpp: company.billingKpp,
    legalAddress: company.legalAddress,
    bankName: company.bankName,
    bankBik: company.bankBik,
    bankAccount: company.bankAccount,
    correspondentAccount: company.correspondentAccount,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
  };
}

export function serializeSubscription(subscription: Subscription) {
  return {
    id: subscription.id,
    companyId: subscription.companyId,
    plan: subscription.plan,
    status: subscription.status,
    startsAt: subscription.startsAt.toISOString(),
    endsAt: subscription.endsAt.toISOString(),
    reason: subscription.reason,
    createdAt: subscription.createdAt.toISOString(),
    updatedAt: subscription.updatedAt.toISOString(),
  };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function isCompanySubscriptionCurrentlyActive(company: Company, now = new Date()): boolean {
  return (
    company.status === CompanyStatus.active &&
    Boolean(company.subscriptionPlan) &&
    Boolean(company.subscriptionEndsAt) &&
    company.subscriptionEndsAt!.getTime() > now.getTime()
  );
}

function stableStringify(value: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = value[key];
        return acc;
      }, {}),
  );
}
