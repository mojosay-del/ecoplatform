import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";
import { withEnv } from "./test/integration-helpers";
import { bearer, createMarketplaceTestHelpers } from "./test/marketplace-integration-helpers";

const ctx = setupIntegrationContext();
const { registerCompany } = ctx;
const { createPublishedListing, listingPayload, seedNomenclature, seedPhotos } = createMarketplaceTestHelpers(ctx);

describe("Marketplace — карта и фильтры (фаза 2)", () => {
  it("адресные подсказки без ключа геокодера мягко возвращают пустой список", async () => {
    await withEnv({ DGIS_GEOCODER_API_KEY: undefined }, async () => {
      const { token } = await registerCompany("0009399");

      const res = await ctx.http.get("/api/marketplace/address-suggest?q=Москва").set(bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  it("фильтры по региону/сырью + список регионов; без ключа геокодера круг пуст", async () => {
    await withEnv({ DGIS_GEOCODER_API_KEY: undefined }, async () => {
      const { token } = await registerCompany("0009401");
      const category = await ctx.prisma.nomenclatureCategory.create({
        data: { name: "Макулатура", slug: "makulatura", position: 1 },
      });
      const cardboard = await ctx.prisma.nomenclature.create({
        data: { code: "MS-5B", name: "МС-5Б", categoryId: category.id },
      });
      const pet = await ctx.prisma.nomenclature.create({
        data: { code: "PET", name: "ПЭТ", categoryId: category.id },
      });

      const photosMoscow = await seedPhotos(4);
      const moscowListing = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(token))
        .send({ ...listingPayload(cardboard.id, photosMoscow), address: { city: "Москва", region: "Москва" } });
      await ctx.http.post(`/api/marketplace/listings/${moscowListing.body.id}/publish`).set(bearer(token));

      const photosSpb = await seedPhotos(4);
      const spbListing = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(token))
        .send({
          positions: [{ nomenclatureId: pet.id, weightKg: 1500, form: "loose" }],
          address: { city: "Санкт-Петербург", region: "Санкт-Петербург" },
          contactPhone: "+79991234567",
          readyNow: true,
          media: photosSpb.map((fileId) => ({ fileId, kind: "photo" })),
        });
      await ctx.http.post(`/api/marketplace/listings/${spbListing.body.id}/publish`).set(bearer(token));

      const photosDraft = await seedPhotos(4);
      await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(token))
        .send({
          ...listingPayload(cardboard.id, photosDraft),
          address: { city: "Казань", region: "Татарстан" },
        });

      const all = await ctx.http.get("/api/marketplace/listings").set(bearer(token));
      expect(all.body.items).toHaveLength(2);
      // Без ключа геокодера координаты круга не заполняются.
      expect(all.body.items.every((item: { circleLat: number | null }) => item.circleLat === null)).toBe(true);

      const byRegion = await ctx.http
        .get(`/api/marketplace/listings?region[]=${encodeURIComponent("Москва")}`)
        .set(bearer(token));
      expect(byRegion.body.items).toHaveLength(1);
      expect(byRegion.body.items[0].city).toBe("Москва");

      const byNomenclature = await ctx.http
        .get(`/api/marketplace/listings?nomenclatureId[]=${pet.id}`)
        .set(bearer(token));
      expect(byNomenclature.body.items).toHaveLength(1);
      expect(byNomenclature.body.items[0].city).toBe("Санкт-Петербург");

      const regions = await ctx.http.get("/api/marketplace/regions").set(bearer(token));
      expect(regions.body).toEqual(["Москва", "Санкт-Петербург"]);
    });
  });

  it("bbox-фильтр «Искать в этой области» режет ленту по видимой области карты", async () => {
    const { token } = await registerCompany("0009402");
    const nomenclatureId = await seedNomenclature();
    const { listingId: tulaId } = await createPublishedListing(token, nomenclatureId);
    const { listingId: rostovId } = await createPublishedListing(token, nomenclatureId);
    // Координаты круга сажаем напрямую: Тула и Ростов-на-Дону.
    await ctx.prisma.marketplaceListing.update({
      where: { id: tulaId },
      data: { circleLat: 54.19, circleLon: 37.62 },
    });
    await ctx.prisma.marketplaceListing.update({
      where: { id: rostovId },
      data: { circleLat: 47.22, circleLon: 39.72 },
    });

    // Окно вокруг Тулы ловит только тульское объявление.
    const aroundTula = await ctx.http.get("/api/marketplace/listings?bbox=53,36,55,39").set(bearer(token));
    expect(aroundTula.status).toBe(200);
    expect(aroundTula.body.items.map((item: { id: string }) => item.id)).toEqual([tulaId]);

    // Негеокодированные объявления (circleLat=null) в bbox-выдачу не попадают.
    const { listingId: noGeoId } = await createPublishedListing(token, nomenclatureId);
    const wide = await ctx.http.get("/api/marketplace/listings?bbox=40,30,60,45").set(bearer(token));
    const wideIds = wide.body.items.map((item: { id: string }) => item.id);
    expect(wideIds).toContain(tulaId);
    expect(wideIds).toContain(rostovId);
    expect(wideIds).not.toContain(noGeoId);

    // Мусорный bbox отклоняется валидацией.
    const malformed = await ctx.http.get("/api/marketplace/listings?bbox=мусор").set(bearer(token));
    expect(malformed.status).toBe(400);
    const outOfRange = await ctx.http.get("/api/marketplace/listings?bbox=95,36,99,39").set(bearer(token));
    expect(outOfRange.status).toBe(400);
  });

  it("bbox через антимеридиан (west > east) ловит обе стороны 180-го меридиана", async () => {
    const { token } = await registerCompany("0009403");
    const nomenclatureId = await seedNomenclature();
    const { listingId: chukotkaWestId } = await createPublishedListing(token, nomenclatureId);
    const { listingId: chukotkaEastId } = await createPublishedListing(token, nomenclatureId);
    const { listingId: tulaId } = await createPublishedListing(token, nomenclatureId);
    await ctx.prisma.marketplaceListing.update({
      where: { id: chukotkaWestId },
      data: { circleLat: 66.0, circleLon: 179.5 },
    });
    await ctx.prisma.marketplaceListing.update({
      where: { id: chukotkaEastId },
      data: { circleLat: 66.0, circleLon: -179.5 },
    });
    await ctx.prisma.marketplaceListing.update({
      where: { id: tulaId },
      data: { circleLat: 54.19, circleLon: 37.62 },
    });

    const acrossDateline = await ctx.http.get("/api/marketplace/listings?bbox=60,178,70,-178").set(bearer(token));
    expect(acrossDateline.status).toBe(200);
    const ids = acrossDateline.body.items.map((item: { id: string }) => item.id);
    expect(ids).toContain(chukotkaWestId);
    expect(ids).toContain(chukotkaEastId);
    expect(ids).not.toContain(tulaId);
  });
});
