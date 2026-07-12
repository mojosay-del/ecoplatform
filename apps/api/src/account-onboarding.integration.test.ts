import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";

const ctx = setupIntegrationContext();
const { registerCompany } = ctx;

describe("Account — онбординг-туры", () => {
  it("отметка тура попадает в /auth/me и идемпотентна", async () => {
    const { token } = await registerCompany("0000201", { activateTrial: false });

    const before = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);
    expect(before.body.onboardingToursCompleted).toEqual([]);

    const first = await ctx.http
      .post("/api/account/onboarding/tours")
      .set("Authorization", `Bearer ${token}`)
      .send({ tour: "platform" });
    expect(first.status).toBe(201);
    expect(first.body.onboardingToursCompleted).toEqual(["platform"]);

    // Повторная отметка того же тура не создаёт дублей.
    const repeat = await ctx.http
      .post("/api/account/onboarding/tours")
      .set("Authorization", `Bearer ${token}`)
      .send({ tour: "platform" });
    expect(repeat.status).toBe(201);
    expect(repeat.body.onboardingToursCompleted).toEqual(["platform"]);

    const second = await ctx.http
      .post("/api/account/onboarding/tours")
      .set("Authorization", `Bearer ${token}`)
      .send({ tour: "indices" });
    expect(second.status).toBe(201);
    expect(second.body.onboardingToursCompleted).toEqual(["platform", "indices"]);

    const me = await ctx.http.get("/api/auth/me").set("Authorization", `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.onboardingToursCompleted).toEqual(["platform", "indices"]);
  });

  it("неизвестный ключ тура отклоняется, без токена — 401", async () => {
    const { token } = await registerCompany("0000202", { activateTrial: false });

    const invalid = await ctx.http
      .post("/api/account/onboarding/tours")
      .set("Authorization", `Bearer ${token}`)
      .send({ tour: "not-a-tour" });
    expect(invalid.status).toBe(400);

    const unauthorized = await ctx.http.post("/api/account/onboarding/tours").send({ tour: "platform" });
    expect(unauthorized.status).toBe(401);
  });
});
