import { ConflictException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { replayManualSubscription, replayTrialActivation } from "./billing-subscription.helpers";

const requestHash = "request-hash";
const iso = "2026-06-22T12:00:00.000Z";

const company = {
  id: "company-1",
  organizationName: "ООО Тест",
  type: "collector",
  status: "active",
  demoEndsAt: null,
  subscriptionPlan: "basic",
  subscriptionEndsAt: iso,
  billingInn: null,
  billingKpp: null,
  legalAddress: null,
  bankName: null,
  bankBik: null,
  bankAccount: null,
  correspondentAccount: null,
  createdAt: iso,
  updatedAt: iso,
};

const subscription = {
  id: "subscription-1",
  companyId: company.id,
  plan: "basic",
  status: "active",
  startsAt: iso,
  endsAt: iso,
  reason: "test",
  createdAt: iso,
  updatedAt: iso,
};

describe("billing subscription replay helpers", () => {
  it("возвращает валидный manual subscription replay", () => {
    const response = { company, subscription };

    expect(replayManualSubscription({ requestHash, response }, requestHash)).toEqual(response);
  });

  it("возвращает валидный trial replay", () => {
    const response = { company: { ...company, status: "demo", subscriptionPlan: null }, trialEndsAt: iso };

    expect(replayTrialActivation({ requestHash, response }, requestHash)).toEqual(response);
  });

  it("отклоняет повтор с другим request hash", () => {
    expect(() =>
      replayManualSubscription({ requestHash, response: { company, subscription } }, "different-hash"),
    ).toThrow(ConflictException);
  });

  it("отклоняет null response как ещё обрабатываемый запрос", () => {
    expect(() => replayManualSubscription({ requestHash, response: null }, requestHash)).toThrow(
      "Запрос с этим Idempotency-Key ещё обрабатывается. Повторите позже.",
    );
  });

  it("отклоняет повреждённый сохранённый response", () => {
    expect(() =>
      replayManualSubscription({ requestHash, response: { company: { id: company.id } } as never }, requestHash),
    ).toThrow("Сохранённый ответ для этого Idempotency-Key повреждён. Повторите запрос позже.");
  });
});
