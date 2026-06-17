import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";
import { bearer } from "./test/marketplace-integration-helpers";

const ctx = setupIntegrationContext();
const { loginAdmin, registerCompany } = ctx;

describe("Marketplace feature gate", () => {
  it("по умолчанию закрывает API для пользователей и персонала, а после включения открывает обратно", async () => {
    const adminToken = await loginAdmin();
    const user = await registerCompany("0009701");

    const anonymous = await ctx.http.get("/api/marketplace/listings");
    expect(anonymous.status).toBe(401);

    const userDenied = await ctx.http.get("/api/marketplace/listings").set(bearer(user.token));
    expect(userDenied.status).toBe(403);

    const adminDenied = await ctx.http.get("/api/marketplace/listings").set(bearer(adminToken));
    expect(adminDenied.status).toBe(403);

    const meBefore = await ctx.http.get("/api/auth/me").set(bearer(user.token));
    expect(meBefore.body.features.marketplace).toBe(false);

    const enabled = await ctx.http
      .patch("/api/admin/settings/marketplace.enabled")
      .set(bearer(adminToken))
      .send({ value: true });
    expect(enabled.status).toBe(200);

    const meAfter = await ctx.http.get("/api/auth/me").set(bearer(user.token));
    expect(meAfter.body.features.marketplace).toBe(true);

    const userAllowed = await ctx.http.get("/api/marketplace/listings").set(bearer(user.token));
    expect(userAllowed.status).toBe(200);
    expect(userAllowed.body.items).toEqual([]);
  });
});
