import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketplaceListingsService } from "./marketplace/services/marketplace-listings.service";
import { setupIntegrationContext } from "./test/integration-context";
import { expectPaginatedEnvelope, withEnv } from "./test/integration-helpers";
import { bearer, createMarketplaceTestHelpers } from "./test/marketplace-integration-helpers";

const ctx = setupIntegrationContext();
const { loginAdmin, registerCompany } = ctx;
const { createPublishedListing, enableMarketplace, listingPayload, registerTrader, seedNomenclature, seedPhotos } =
  createMarketplaceTestHelpers(ctx);

beforeEach(enableMarketplace);

describe("Marketplace — публичный доступ", () => {
  it("требует авторизацию", async () => {
    const res = await ctx.http.get("/api/marketplace/listings");
    expect(res.status).toBe(401);
  });

  it("площадка открывается всем авторизованным пользователям", async () => {
    const { token: userToken } = await registerCompany("0009002");

    const res = await ctx.http.get("/api/marketplace/listings").set("Authorization", `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expectPaginatedEnvelope(res.body);
    expect(res.body.items).toEqual([]);
  });
});

describe("Marketplace — объявления (фаза 1)", () => {
  it("заготовитель создаёт черновик, публикует — попадает в ленту и в «мои объявления»", async () => {
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
    expect(draft.body.packaging).toBe("Палет");
    expect(draft.body.positions[0].packaging).toBe("Палет");
    expect(draft.body.positions[0].moistureCondition).toBe("slightly_wet");
    expect(draft.body.positions[0].contaminationCondition).toBe("may_have_inclusions");
    expect(draft.body.positions[0]).not.toHaveProperty("moisturePct");
    expect(draft.body.positions[0]).not.toHaveProperty("contaminationPct");

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

  it("categorySlug в ленте + объём в машину в детали (UI-батч)", async () => {
    const seller = await registerCompany("0009110");
    const nomenclatureId = await seedNomenclature();
    const { listingId } = await createPublishedListing(seller.token, nomenclatureId);

    const detail = await ctx.http.get(`/api/marketplace/listings/${listingId}`).set(bearer(seller.token));
    expect(detail.status).toBe(200);
    expect(detail.body.typicalLoadKg).toBe(20000);
    expect(detail.body.positions[0].categorySlug).toBe("makulatura");

    const feed = await ctx.http.get("/api/marketplace/listings").set(bearer(seller.token));
    expect(feed.body.items[0].positions[0].categorySlug).toBe("makulatura");

    // Справочник отдаёт slug категории — по нему красятся чипы фильтра сырья.
    const nomenclature = await ctx.http.get("/api/marketplace/nomenclature").set(bearer(seller.token));
    expect(nomenclature.status).toBe(200);
    const option = nomenclature.body.find((item: { id: string }) => item.id === nomenclatureId);
    expect(option).toMatchObject({ category: "Макулатура", categorySlug: "makulatura" });
  });

  it("публикация без 4 фото или с весом <100 кг отклоняется", async () => {
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

  it("покупатель (трейдер) не может создавать, но видит ленту со скрытыми контактами", async () => {
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

  it("админ видит чужое объявление как НЕ владелец, но с контактами (isOwner≠canSeeContacts)", async () => {
    const seller = await registerCompany("0009107");
    const nomenclatureId = await seedNomenclature();
    const { listingId } = await createPublishedListing(seller.token, nomenclatureId);

    const adminToken = await loginAdmin();
    const detail = await ctx.http.get(`/api/marketplace/listings/${listingId}`).set(bearer(adminToken));
    expect(detail.status).toBe(200);
    // Админ не владелец — кнопок редактирования быть не должно…
    expect(detail.body.isOwner).toBe(false);
    // …но контакты ему раскрыты (canSeeContacts по роли).
    expect(detail.body.contactPhone).not.toBeNull();
  });

  it("чужое объявление нельзя редактировать или архивировать (404)", async () => {
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

  it("архив + переподача создают новый черновик-копию", async () => {
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

    const republished = await ctx.http.post(`/api/marketplace/listings/${draft.body.id}/republish`).set(bearer(token));
    expect(republished.status).toBe(201);
    expect(republished.body.status).toBe("draft");
    expect(republished.body.id).not.toBe(draft.body.id);
    expect(republished.body.positions).toHaveLength(1);
  });

  it("переподача заново геокодит адрес, если у исходного объявления нет координат", async () => {
    await withEnv({ DADATA_API_KEY: undefined }, async () => {
      const { token } = await registerCompany("0009109");
      const nomenclatureId = await seedNomenclature();
      const photos = await seedPhotos(4);
      const draft = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(token))
        .send(
          listingPayload(nomenclatureId, photos, {
            address: {
              city: "Москва",
              region: "Москва",
              street: "Тверская улица",
              building: "1",
              formatted: "Россия, Москва, Тверская улица, 1",
            },
          }),
        );
      await ctx.http.post(`/api/marketplace/listings/${draft.body.id}/publish`).set(bearer(token));

      const archived = await ctx.http.post(`/api/marketplace/listings/${draft.body.id}/archive`).set(bearer(token));
      expect(archived.body.status).toBe("archived");

      const source = await ctx.prisma.marketplaceListing.findUniqueOrThrow({
        where: { id: draft.body.id },
        include: { address: true },
      });
      expect(source.address.latitude).toBeNull();
      expect(source.address.longitude).toBeNull();

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          suggestions: [
            {
              value: "Россия, Москва, Тверская улица, 1",
              data: {
                country: "Россия",
                region_with_type: "Москва",
                city_with_type: "Москва",
                street_with_type: "Тверская улица",
                house: "1",
                geo_lat: "55.755864",
                geo_lon: "37.617698",
              },
            },
          ],
        }),
      });

      try {
        vi.stubGlobal("fetch", fetchMock);
        await withEnv({ DADATA_API_KEY: "test-key" }, async () => {
          const republished = await ctx.http
            .post(`/api/marketplace/listings/${draft.body.id}/republish`)
            .set(bearer(token));
          expect(republished.status).toBe(201);

          expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("suggestions.dadata.ru"), expect.any(Object));
          const created = await ctx.prisma.marketplaceListing.findUniqueOrThrow({
            where: { id: republished.body.id },
            include: { address: true },
          });
          expect(created.address.latitude?.toString()).toBe("55.755864");
          expect(created.address.longitude?.toString()).toBe("37.617698");
          expect(created.address.region).toBe("Москва");
          expect(created.circleLat).not.toBeNull();
          expect(created.circleLon).not.toBeNull();
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  it("нельзя держать больше лимита активных объявлений", async () => {
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

  it("cron архивирует истёкшие активные объявления", async () => {
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
