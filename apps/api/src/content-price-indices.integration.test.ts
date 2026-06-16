import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";

const ctx = setupIntegrationContext();
const { loginAdmin, registerCompany } = ctx;

describe("Content lifecycle: price indices", () => {
  async function createNomenclature(adminToken: string, code: string, name: string) {
    const nomenclature = await ctx.http
      .post("/api/admin/content/indices/nomenclature")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ code, name });
    expect(nomenclature.status).toBe(201);
    return nomenclature.body.id as string;
  }

  async function createPriceIndexWithValue(adminToken: string, suffix: string) {
    const nomenclatureId = await createNomenclature(adminToken, `CODE-${suffix}`, `Номенклатура ${suffix}`);

    const indexRes = await ctx.http
      .post("/api/admin/content/indices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nomenclatureId });
    expect(indexRes.status).toBe(201);

    const valueRes = await ctx.http
      .post(`/api/admin/content/indices/${indexRes.body.id}/values`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "2026-05-19T00:00:00.000Z", price: 12000 });
    expect(valueRes.status).toBe(201);

    return { indexId: indexRes.body.id as string, nomenclatureId };
  }

  it("move номенклатуры меняет глобальный порядок в админке и на /indices", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800019");

    async function createPublishedNomenclature(code: string, name: string, price: number) {
      const nomenclatureId = await createNomenclature(adminToken, code, name);

      const indexRes = await ctx.http
        .post("/api/admin/content/indices")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ nomenclatureId });
      expect(indexRes.status).toBe(201);

      const valueRes = await ctx.http
        .post(`/api/admin/content/indices/${indexRes.body.id}/values`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ date: "2026-05-19T00:00:00.000Z", price });
      expect(valueRes.status).toBe(201);

      const publish = await ctx.http
        .post(`/api/admin/content/indices/${indexRes.body.id}/publish`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(publish.status).toBe(201);

      return nomenclatureId;
    }

    const firstId = await createPublishedNomenclature("REORDER-1", "Первая", 12000);
    const secondId = await createPublishedNomenclature("REORDER-2", "Вторая", 13000);
    const thirdId = await createPublishedNomenclature("REORDER-3", "Третья", 14000);

    const ourIds = new Set([firstId, secondId, thirdId]);
    const onlyOurs = (items: Array<{ id: string }>) => items.map((item) => item.id).filter((id) => ourIds.has(id));

    const move = await ctx.http
      .patch(`/api/admin/content/indices/nomenclature/${thirdId}/move`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ position: 0 });
    expect(move.status).toBe(200);
    expect(move.body.position).toBe(0);

    const adminList = await ctx.http.get("/api/admin/content/indices").set("Authorization", `Bearer ${adminToken}`);
    expect(onlyOurs(adminList.body.items)).toEqual([thirdId, firstId, secondId]);

    const publicList = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    expect(onlyOurs(publicList.body.items)).toEqual([thirdId, firstId, secondId]);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: thirdId, action: "indices.nomenclature.move" },
    });
    expect(log?.payload).toMatchObject({ to: { position: 0 } });
  });

  it("publish индекса делает его видимым в /indices, unpublish скрывает, delete удаляет", async () => {
    const adminToken = await loginAdmin();
    const reader = await registerCompany("0800020");
    const { indexId, nomenclatureId } = await createPriceIndexWithValue(adminToken, "lifecycle");

    const findIndex = (body: Array<{ id: string }>) => body.some((nom) => nom.id === nomenclatureId);

    const beforePublish = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    expect(findIndex(beforePublish.body.items)).toBe(false);

    const publish = await ctx.http
      .post(`/api/admin/content/indices/${indexId}/publish`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(publish.status).toBe(201);

    const afterPublish = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    expect(findIndex(afterPublish.body.items)).toBe(true);

    const unpublish = await ctx.http
      .post(`/api/admin/content/indices/${indexId}/unpublish`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(unpublish.status).toBe(201);

    const afterUnpublish = await ctx.http.get("/api/indices").set("Authorization", `Bearer ${reader.token}`);
    expect(findIndex(afterUnpublish.body.items)).toBe(false);

    const del = await ctx.http
      .delete(`/api/admin/content/indices/${indexId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест" });
    expect(del.status).toBe(200);

    const found = await ctx.prisma.priceIndex.findUnique({ where: { id: indexId } });
    expect(found).toBeNull();
  });

  it("add/update значения индекса валидирует индекс и пишет audit log", async () => {
    const adminToken = await loginAdmin();
    const nomenclatureId = await createNomenclature(adminToken, "AUDIT-VALUE", "Номенклатура audit value");

    const indexRes = await ctx.http
      .post("/api/admin/content/indices")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ nomenclatureId });
    expect(indexRes.status).toBe(201);

    const missing = await ctx.http
      .post("/api/admin/content/indices/missing-index/values")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "2026-05-19T00:00:00.000Z", price: 12000 });
    expect(missing.status).toBe(404);

    const created = await ctx.http
      .post(`/api/admin/content/indices/${indexRes.body.id}/values`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "2026-05-19T00:00:00.000Z", price: 12000 });
    expect(created.status).toBe(201);

    const updated = await ctx.http
      .post(`/api/admin/content/indices/${indexRes.body.id}/values`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ date: "2026-05-19T00:00:00.000Z", price: 13000 });
    expect(updated.status).toBe(201);
    expect(updated.body.id).toBe(created.body.id);

    const logs = await ctx.prisma.adminActionLog.findMany({
      where: { entityId: created.body.id },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((log) => log.action)).toEqual(["indices.value.create", "indices.value.update"]);
    expect(logs[1]?.payload).toMatchObject({ beforePrice: "12000", afterPrice: "13000" });
  });

  it("delete номенклатуры удаляет связанный индекс и всю историю цен", async () => {
    const adminToken = await loginAdmin();
    const { indexId, nomenclatureId } = await createPriceIndexWithValue(adminToken, "cascade-delete");

    await expect(ctx.prisma.priceIndexValue.count({ where: { priceIndexId: indexId } })).resolves.toBe(1);

    const del = await ctx.http
      .delete(`/api/admin/content/indices/nomenclature/${nomenclatureId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ reason: "тест полного удаления" });
    expect(del.status).toBe(200);

    await expect(ctx.prisma.nomenclature.findUnique({ where: { id: nomenclatureId } })).resolves.toBeNull();
    await expect(ctx.prisma.priceIndex.findUnique({ where: { id: indexId } })).resolves.toBeNull();
    await expect(ctx.prisma.priceIndexValue.count({ where: { priceIndexId: indexId } })).resolves.toBe(0);

    const log = await ctx.prisma.adminActionLog.findFirst({
      where: { entityId: nomenclatureId, action: "indices.nomenclature.delete" },
    });
    expect(log?.payload).toMatchObject({ priceIndexId: indexId, priceValuesDeleted: 1 });
  });
});
