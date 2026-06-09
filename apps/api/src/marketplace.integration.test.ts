import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";
import { expectPaginatedEnvelope, withEnv } from "./test/integration-helpers";

// Торговая площадка строится «за закрытыми дверьми»: до публичного запуска
// раздел доступен только платформенным админам (дог-фуд на проде), а при
// MARKETPLACE_ENABLED=1 открывается всем авторизованным пользователям.
// На этапе фундамента проверяем именно этот гейт + пустую публичную ленту.
const ctx = setupIntegrationContext();
const { loginAdmin, registerCompany } = ctx;

describe("Marketplace — доступ за закрытыми дверьми", () => {
  it("требует авторизацию", async () => {
    const res = await ctx.http.get("/api/marketplace/listings");
    expect(res.status).toBe(401);
  });

  it("пока флаг выключен — площадка доступна только админам", async () => {
    await withEnv({ MARKETPLACE_ENABLED: undefined }, async () => {
      const adminToken = await loginAdmin();
      const { token: userToken } = await registerCompany("0009001");

      // Обычный пользователь: раздела «как будто не существует» (404, не 403).
      const closed = await ctx.http.get("/api/marketplace/listings").set("Authorization", `Bearer ${userToken}`);
      expect(closed.status).toBe(404);

      // Админ: доступ открыт для дог-фуда, лента пока пустая.
      const adminRes = await ctx.http.get("/api/marketplace/listings").set("Authorization", `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
      expectPaginatedEnvelope(adminRes.body);
      expect(adminRes.body.items).toEqual([]);
      expect(adminRes.body.total).toBe(0);
    });
  });

  it("при MARKETPLACE_ENABLED=1 площадка открывается всем авторизованным", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const { token: userToken } = await registerCompany("0009002");

      const res = await ctx.http.get("/api/marketplace/listings").set("Authorization", `Bearer ${userToken}`);
      expect(res.status).toBe(200);
      expectPaginatedEnvelope(res.body);
      expect(res.body.items).toEqual([]);
    });
  });
});
