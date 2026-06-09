import { describe, expect, it } from "vitest";
import { MarketplaceListingsService } from "./marketplace/services/marketplace-listings.service";
import { setupIntegrationContext } from "./test/integration-context";
import { expectPaginatedEnvelope, withEnv } from "./test/integration-helpers";

// Торговая площадка строится «за закрытыми дверьми»: до публичного запуска
// раздел доступен только платформенным админам (дог-фуд на проде), а при
// MARKETPLACE_ENABLED=1 открывается всем авторизованным пользователям.
// На этапе фундамента проверяем именно этот гейт + пустую публичную ленту.
const ctx = setupIntegrationContext();
const { loginAdmin, registerCompany, registerWithBody } = ctx;

function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedNomenclature(): Promise<string> {
  const category = await ctx.prisma.nomenclatureCategory.create({
    data: { name: "Макулатура", slug: "makulatura", position: 1 },
  });
  const nomenclature = await ctx.prisma.nomenclature.create({
    data: { code: "MS-5B", name: "МС-5Б", categoryId: category.id },
  });
  return nomenclature.id;
}

async function seedPhotos(count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const asset = await ctx.prisma.fileAsset.create({
      data: {
        originalName: `photo-${index}.webp`,
        mimeType: "image/webp",
        sizeBytes: 2048,
        storageKey: `test/listing-${Math.random().toString(36).slice(2)}.webp`,
        accessLevel: "authenticated",
      },
    });
    ids.push(asset.id);
  }
  return ids;
}

function listingPayload(nomenclatureId: string, photoIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    positions: [{ nomenclatureId, weightKg: 1500, form: "pressed" }],
    address: { city: "Москва", region: "Москва" },
    contactPhone: "+79991234567",
    readyNow: true,
    media: photoIds.map((fileId) => ({ fileId, kind: "photo" })),
    ...overrides,
  };
}

async function registerTrader(suffix: string): Promise<string> {
  return registerWithBody({
    organizationName: `ООО Трейдер ${suffix}`,
    companyType: "trader",
    firstName: "Пётр",
    lastName: "Покупатель",
    gender: "male",
    phone: `+7901${suffix}`,
    email: `trader${suffix}@test.local`,
    password: "User12345678",
  });
}

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

describe("Marketplace — объявления (фаза 1)", () => {
  it("заготовитель создаёт черновик, публикует — попадает в ленту и в «мои объявления»", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const { token } = await registerCompany("0009101");
      const nomenclatureId = await seedNomenclature();
      const photos = await seedPhotos(4);

      const draft = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(token))
        .send(listingPayload(nomenclatureId, photos));
      expect(draft.status).toBe(201);
      expect(draft.body.status).toBe("draft");
      expect(draft.body.isOwner).toBe(true);
      // Владелец видит свой телефон и адрес.
      expect(draft.body.contactPhone).toBe("+79991234567");
      expect(draft.body.address?.city).toBe("Москва");
      expect(draft.body.positions).toHaveLength(1);

      const publish = await ctx.http.post(`/api/marketplace/listings/${draft.body.id}/publish`).set(bearer(token));
      expect(publish.status).toBe(201);
      expect(publish.body.status).toBe("active");
      expect(publish.body.publishedAt).toEqual(expect.any(String));
      expect(publish.body.expiresAt).toEqual(expect.any(String));

      const feed = await ctx.http.get("/api/marketplace/listings").set(bearer(token));
      expect(feed.status).toBe(200);
      expect(feed.body.items).toHaveLength(1);
      expect(feed.body.items[0].photoCount).toBe(4);
      expect(feed.body.items[0].sellerType).toBe("collector");

      const mine = await ctx.http.get("/api/marketplace/my/listings").set(bearer(token));
      expect(mine.body.items).toHaveLength(1);
      expect(mine.body.items[0].status).toBe("active");
    });
  });

  it("публикация без 4 фото или с весом <100 кг отклоняется", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const { token } = await registerCompany("0009102");
      const nomenclatureId = await seedNomenclature();

      const fewPhotos = await seedPhotos(2);
      const draftA = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(token))
        .send(listingPayload(nomenclatureId, fewPhotos));
      const publishA = await ctx.http.post(`/api/marketplace/listings/${draftA.body.id}/publish`).set(bearer(token));
      expect(publishA.status).toBe(400);

      const enoughPhotos = await seedPhotos(4);
      const draftB = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(token))
        .send(
          listingPayload(nomenclatureId, enoughPhotos, {
            positions: [{ nomenclatureId, weightKg: 50, form: "loose" }],
          }),
        );
      const publishB = await ctx.http.post(`/api/marketplace/listings/${draftB.body.id}/publish`).set(bearer(token));
      expect(publishB.status).toBe(400);
    });
  });

  it("покупатель (трейдер) не может создавать, но видит ленту со скрытыми контактами", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const { token: sellerToken } = await registerCompany("0009103");
      const nomenclatureId = await seedNomenclature();
      const photos = await seedPhotos(4);
      const draft = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(sellerToken))
        .send(listingPayload(nomenclatureId, photos));
      await ctx.http.post(`/api/marketplace/listings/${draft.body.id}/publish`).set(bearer(sellerToken));

      const traderToken = await registerTrader("0009103");

      const create = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(traderToken))
        .send(listingPayload(nomenclatureId, photos));
      expect(create.status).toBe(403);

      const feed = await ctx.http.get("/api/marketplace/listings").set(bearer(traderToken));
      expect(feed.status).toBe(200);
      expect(feed.body.items).toHaveLength(1);

      const detail = await ctx.http.get(`/api/marketplace/listings/${draft.body.id}`).set(bearer(traderToken));
      expect(detail.status).toBe(200);
      expect(detail.body.isOwner).toBe(false);
      // Точные контакты и адрес скрыты до акцепта (фаза 3).
      expect(detail.body.contactPhone).toBeNull();
      expect(detail.body.address).toBeNull();
      expect(detail.body.city).toBe("Москва");
    });
  });

  it("чужое объявление нельзя редактировать или архивировать (404)", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const { token: ownerToken } = await registerCompany("0009104");
      const nomenclatureId = await seedNomenclature();
      const photos = await seedPhotos(4);
      const draft = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(ownerToken))
        .send(listingPayload(nomenclatureId, photos));

      const { token: otherToken } = await registerCompany("0009105");
      const patch = await ctx.http
        .patch(`/api/marketplace/listings/${draft.body.id}`)
        .set(bearer(otherToken))
        .send({ contactPhone: "+79990000000" });
      expect(patch.status).toBe(404);

      const archive = await ctx.http.post(`/api/marketplace/listings/${draft.body.id}/archive`).set(bearer(otherToken));
      expect(archive.status).toBe(404);
    });
  });

  it("архив + переподача создают новый черновик-копию", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const { token } = await registerCompany("0009106");
      const nomenclatureId = await seedNomenclature();
      const photos = await seedPhotos(4);
      const draft = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(token))
        .send(listingPayload(nomenclatureId, photos));
      await ctx.http.post(`/api/marketplace/listings/${draft.body.id}/publish`).set(bearer(token));

      const archived = await ctx.http.post(`/api/marketplace/listings/${draft.body.id}/archive`).set(bearer(token));
      expect(archived.body.status).toBe("archived");

      const republished = await ctx.http
        .post(`/api/marketplace/listings/${draft.body.id}/republish`)
        .set(bearer(token));
      expect(republished.status).toBe(201);
      expect(republished.body.status).toBe("draft");
      expect(republished.body.id).not.toBe(draft.body.id);
      expect(republished.body.positions).toHaveLength(1);
    });
  });

  it("нельзя держать больше лимита активных объявлений", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const { token, companyId, userId } = await registerCompany("0009107");
      const nomenclatureId = await seedNomenclature();

      // 10 уже активных объявлений — заводим напрямую (для лимита важен только счётчик).
      const addresses = await Promise.all(
        Array.from({ length: 10 }).map((_, index) =>
          ctx.prisma.address.create({ data: { city: "Москва", formatted: `адрес ${index}` } }),
        ),
      );
      await ctx.prisma.marketplaceListing.createMany({
        data: addresses.map((address) => ({
          sellerCompanyId: companyId,
          createdById: userId,
          addressId: address.id,
          contactPhone: "+79990000000",
          status: "active" as const,
          publishedAt: new Date(),
          expiresAt: new Date(Date.now() + 1_000_000_000),
        })),
      });

      const photos = await seedPhotos(4);
      const draft = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(token))
        .send(listingPayload(nomenclatureId, photos));
      const publish = await ctx.http.post(`/api/marketplace/listings/${draft.body.id}/publish`).set(bearer(token));
      expect(publish.status).toBe(400);
    });
  });

  it("cron архивирует истёкшие активные объявления", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const { token } = await registerCompany("0009108");
      const nomenclatureId = await seedNomenclature();
      const photos = await seedPhotos(4);
      const draft = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(token))
        .send(listingPayload(nomenclatureId, photos));
      await ctx.http.post(`/api/marketplace/listings/${draft.body.id}/publish`).set(bearer(token));
      await ctx.prisma.marketplaceListing.update({
        where: { id: draft.body.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const archivedCount = await ctx.app.get(MarketplaceListingsService).archiveExpired();
      expect(archivedCount).toBeGreaterThanOrEqual(1);

      const after = await ctx.prisma.marketplaceListing.findUnique({ where: { id: draft.body.id } });
      expect(after?.status).toBe("archived");
      expect(after?.archiveReason).toBe("expired");
    });
  });
});
