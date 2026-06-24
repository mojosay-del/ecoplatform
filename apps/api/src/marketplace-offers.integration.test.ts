import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketplaceOffersService } from "./marketplace/services/marketplace-offers.service";
import { setupIntegrationContext } from "./test/integration-context";
import { withEnv } from "./test/integration-helpers";
import { bearer, createMarketplaceTestHelpers } from "./test/marketplace-integration-helpers";

const ctx = setupIntegrationContext();
const { registerCompany } = ctx;
const { createPublishedListing, enableMarketplace, offerPayload, registerProcessor, registerTrader, seedNomenclature } =
  createMarketplaceTestHelpers(ctx);

beforeEach(enableMarketplace);

describe("Marketplace — предложения и аукцион (фаза 3)", () => {
  it("полный цикл: предложение → принятие (раскрытие контактов) → «Договорились» → продано", async () => {
    const { token: sellerToken } = await registerCompany("0009201");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
    const buyerToken = await registerTrader("0009201");

    const offer = await ctx.http
      .post(`/api/marketplace/listings/${listingId}/offers`)
      .set(bearer(buyerToken))
      .send(offerPayload(positionId));
    expect(offer.status).toBe(201);
    expect(offer.body.status).toBe("active");
    expect(offer.body.positions[0].pricePerTonRub).toBe(12_500);
    // До акцепта контакты продавца скрыты от покупателя.
    expect(offer.body.sellerContact).toBeNull();

    // Продавец видит предложение, но контакты покупателя скрыты.
    const sellerView = await ctx.http.get(`/api/marketplace/listings/${listingId}/offers`).set(bearer(sellerToken));
    expect(sellerView.status).toBe(200);
    expect(sellerView.body).toHaveLength(1);
    expect(sellerView.body[0].buyerContact).toBeNull();

    const accept = await ctx.http.post(`/api/marketplace/offers/${offer.body.id}/accept`).set(bearer(sellerToken));
    expect(accept.status).toBe(201);
    expect(accept.body.status).toBe("accepted");
    // После акцепта продавец видит телефон покупателя.
    expect(accept.body.buyerContact?.phone).toBe("+79995554433");

    // А покупатель — телефон продавца (из объявления).
    const myOffers = await ctx.http.get("/api/marketplace/my/offers").set(bearer(buyerToken));
    expect(myOffers.body.items[0].sellerContact?.phone).toBe("+79991234567");

    const deal = await ctx.http
      .post(`/api/marketplace/offers/${offer.body.id}/deal`)
      .set(bearer(sellerToken))
      .send({ result: "agreed" });
    expect(deal.status).toBe(201);
    expect(deal.body.dealResult).toBe("agreed");

    const listing = await ctx.prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    expect(listing?.status).toBe("archived");
    expect(listing?.archiveReason).toBe("sold");
  });

  it("скрывает точный город покупателя до акцепта предложения", async () => {
    const { token: sellerToken } = await registerCompany("0009291");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
    const buyerToken = await registerTrader("0009291");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        suggestions: [
          {
            value: "Россия, Московская обл, г Мытищи",
            data: {
              country: "Россия",
              region_with_type: "Московская область",
              city_with_type: "г Мытищи",
              geo_lat: "55.910483",
              geo_lon: "37.73633",
            },
          },
        ],
      }),
    });

    try {
      vi.stubGlobal("fetch", fetchMock);
      await withEnv({ DADATA_API_KEY: "test-key" }, async () => {
        const offer = await ctx.http
          .post(`/api/marketplace/listings/${listingId}/offers`)
          .set(bearer(buyerToken))
          .send(offerPayload(positionId, { priceCondition: "at_gate", city: "Мытищи" }));
        expect(offer.status).toBe(201);
        expect(offer.body.city).toBe("Мытищи");

        const sellerView = await ctx.http.get(`/api/marketplace/listings/${listingId}/offers`).set(bearer(sellerToken));
        expect(sellerView.status).toBe(200);
        expect(sellerView.body[0].buyerContact).toBeNull();
        expect(sellerView.body[0].city).toBeNull();
        expect(sellerView.body[0].region).toBe("Московская область");
        expect(JSON.stringify(sellerView.body[0])).not.toContain("Мытищи");

        const accept = await ctx.http.post(`/api/marketplace/offers/${offer.body.id}/accept`).set(bearer(sellerToken));
        expect(accept.status).toBe(201);
        expect(accept.body.city).toBeNull();
        expect(accept.body.buyerContact?.city).toBe("Мытищи");
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("один активный оффер на покупателя+объявление; заготовитель не может предлагать", async () => {
    const { token: sellerToken } = await registerCompany("0009202");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
    const buyerToken = await registerTrader("0009202");

    const first = await ctx.http
      .post(`/api/marketplace/listings/${listingId}/offers`)
      .set(bearer(buyerToken))
      .send(offerPayload(positionId));
    expect(first.status).toBe(201);

    const second = await ctx.http
      .post(`/api/marketplace/listings/${listingId}/offers`)
      .set(bearer(buyerToken))
      .send(offerPayload(positionId));
    expect(second.status).toBe(400);

    // Заготовитель (collector) не может делать предложения.
    const otherCollector = (await registerCompany("0009212")).token;
    const collectorOffer = await ctx.http
      .post(`/api/marketplace/listings/${listingId}/offers`)
      .set(bearer(otherCollector))
      .send(offerPayload(positionId));
    expect(collectorOffer.status).toBe(403);
  });

  it("параллельные запросы одного покупателя создают только один активный оффер", async () => {
    const { token: sellerToken } = await registerCompany("0009213");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
    const buyerToken = await registerTrader("0009213");
    const buyerMe = await ctx.http.get("/api/auth/me").set(bearer(buyerToken));
    const buyerCompanyId = buyerMe.body.companyId as string;

    const [first, second] = await Promise.all([
      ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyerToken))
        .send(offerPayload(positionId)),
      ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyerToken))
        .send(offerPayload(positionId)),
    ]);

    const responses = [first, second].sort((left, right) => left.status - right.status);
    expect(responses[0].status).toBe(201);
    expect(responses[1].status).toBe(400);
    expect(responses[1].body.message).toBe("У вас уже есть активное предложение по этому объявлению — измените его.");
    const activeOffers = await ctx.prisma.offer.count({
      where: { listingId, buyerCompanyId, status: { in: ["active", "accepted"] } },
    });
    expect(activeOffers).toBe(1);
  });

  it("параллельное принятие не оставляет два принятых оффера по объявлению", async () => {
    const { token: sellerToken } = await registerCompany("0009214");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
    const buyer1 = await registerTrader("0009214");
    const buyer2 = await registerProcessor("0009214");
    const offer1 = (
      await ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyer1))
        .send(offerPayload(positionId))
    ).body;
    const offer2 = (
      await ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyer2))
        .send(offerPayload(positionId))
    ).body;

    const [first, second] = await Promise.all([
      ctx.http.post(`/api/marketplace/offers/${offer1.id}/accept`).set(bearer(sellerToken)),
      ctx.http.post(`/api/marketplace/offers/${offer2.id}/accept`).set(bearer(sellerToken)),
    ]);

    expect([first.status, second.status].sort((left, right) => left - right)).toEqual([201, 400]);
    const acceptedOffers = await ctx.prisma.offer.count({ where: { listingId, status: "accepted" } });
    expect(acceptedOffers).toBe(1);
  });

  it("«Не договорились» оставляет объявление активным и закрывает оффер", async () => {
    const { token: sellerToken } = await registerCompany("0009203");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
    const buyerToken = await registerProcessor("0009203");

    const offer = (
      await ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyerToken))
        .send(offerPayload(positionId))
    ).body;
    await ctx.http.post(`/api/marketplace/offers/${offer.id}/accept`).set(bearer(sellerToken));

    const deal = await ctx.http
      .post(`/api/marketplace/offers/${offer.id}/deal`)
      .set(bearer(sellerToken))
      .send({ result: "not_agreed" });
    expect(deal.body.status).toBe("declined");

    const listing = await ctx.prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    expect(listing?.status).toBe("active");
  });

  it("«Договорились» отклоняет предложения конкурентов", async () => {
    const { token: sellerToken } = await registerCompany("0009204");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
    const buyer1 = await registerTrader("0009204");
    const buyer2 = await registerProcessor("0009204");

    const offer1 = (
      await ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyer1))
        .send(offerPayload(positionId))
    ).body;
    const offer2 = (
      await ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyer2))
        .send(offerPayload(positionId))
    ).body;

    await ctx.http.post(`/api/marketplace/offers/${offer1.id}/accept`).set(bearer(sellerToken));
    await ctx.http
      .post(`/api/marketplace/offers/${offer1.id}/deal`)
      .set(bearer(sellerToken))
      .send({ result: "agreed" });

    const loser = await ctx.prisma.offer.findUnique({ where: { id: offer2.id } });
    expect(loser?.status).toBe("declined");
  });

  it("чужой оффер нельзя отозвать или принять не своему объявлению", async () => {
    const { token: sellerToken } = await registerCompany("0009205");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
    const buyerA = await registerTrader("0009205");
    const offerA = (
      await ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyerA))
        .send(offerPayload(positionId))
    ).body;

    const buyerB = await registerTrader("0009215");
    const withdraw = await ctx.http.post(`/api/marketplace/offers/${offerA.id}/withdraw`).set(bearer(buyerB));
    expect(withdraw.status).toBe(404);

    const otherSeller = (await registerCompany("0009225")).token;
    const accept = await ctx.http.post(`/api/marketplace/offers/${offerA.id}/accept`).set(bearer(otherSeller));
    expect(accept.status).toBe(403);
  });

  it("валидация: «на воротах» требует город; нужна цена хотя бы по одной позиции", async () => {
    const { token: sellerToken } = await registerCompany("0009206");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
    const buyerToken = await registerTrader("0009206");

    const noCity = await ctx.http
      .post(`/api/marketplace/listings/${listingId}/offers`)
      .set(bearer(buyerToken))
      .send(offerPayload(positionId, { priceCondition: "at_gate", city: null }));
    expect(noCity.status).toBe(400);

    const noPrice = await ctx.http
      .post(`/api/marketplace/listings/${listingId}/offers`)
      .set(bearer(buyerToken))
      .send(offerPayload(positionId, { positions: [{ listingPositionId: positionId, pricePerTonRub: null }] }));
    expect(noPrice.status).toBe(400);
  });

  it("cron авто-разрешает принятые предложения без решения за 24ч (объявление → not_settled)", async () => {
    const { token: sellerToken } = await registerCompany("0009207");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
    const buyerToken = await registerTrader("0009207");
    const offer = (
      await ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyerToken))
        .send(offerPayload(positionId))
    ).body;
    await ctx.http.post(`/api/marketplace/offers/${offer.id}/accept`).set(bearer(sellerToken));
    await ctx.prisma.offer.update({
      where: { id: offer.id },
      data: { decisionDeadline: new Date(Date.now() - 1000) },
    });

    const resolved = await ctx.app.get(MarketplaceOffersService).autoResolveExpiredAcceptances();
    expect(resolved).toBeGreaterThanOrEqual(1);

    const listing = await ctx.prisma.marketplaceListing.findUnique({ where: { id: listingId } });
    expect(listing?.status).toBe("archived");
    expect(listing?.archiveReason).toBe("not_settled");
  });

  it("offerCount публичен в ленте и детали (без цен), отзыв ставки уменьшает счётчик", async () => {
    const seller = await registerCompany("0009610");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(seller.token, nomenclatureId);
    const buyerA = await registerTrader("0009611");
    const buyerB = await registerTrader("0009612");

    // До ставок — нулевой счётчик; memberSince в блоке доверия — ISO-дата.
    const before = await ctx.http.get(`/api/marketplace/listings/${listingId}`).set(bearer(buyerA));
    expect(before.body.offerCount).toBe(0);
    expect(before.body.seller.dealsCompleted).toBe(0);
    expect(Number.isNaN(Date.parse(before.body.seller.memberSince))).toBe(false);

    const offerA = (
      await ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyerA))
        .send(offerPayload(positionId))
    ).body;
    const afterFirst = await ctx.http.get(`/api/marketplace/listings/${listingId}`).set(bearer(buyerB));
    expect(afterFirst.body.offerCount).toBe(1);
    const feed = await ctx.http.get("/api/marketplace/listings").set(bearer(buyerB));
    expect(feed.body.items.find((item: { id: string }) => item.id === listingId).offerCount).toBe(1);

    // Вторая ставка другого покупателя — 2; отозванная ставка не считается.
    await ctx.http
      .post(`/api/marketplace/listings/${listingId}/offers`)
      .set(bearer(buyerB))
      .send(offerPayload(positionId));
    const afterSecond = await ctx.http.get(`/api/marketplace/listings/${listingId}`).set(bearer(seller.token));
    expect(afterSecond.body.offerCount).toBe(2);

    await ctx.http.post(`/api/marketplace/offers/${offerA.id}/withdraw`).set(bearer(buyerA));
    const afterWithdraw = await ctx.http.get(`/api/marketplace/listings/${listingId}`).set(bearer(seller.token));
    expect(afterWithdraw.body.offerCount).toBe(1);
  });

  it("dealsCompleted в блоке доверия растёт после «Договорились»", async () => {
    const seller = await registerCompany("0009613");
    const nomenclatureId = await seedNomenclature();
    const buyerToken = await registerTrader("0009614");

    // Сделка по первому объявлению: ставка → акцепт → «Договорились».
    const first = await createPublishedListing(seller.token, nomenclatureId);
    const offer = (
      await ctx.http
        .post(`/api/marketplace/listings/${first.listingId}/offers`)
        .set(bearer(buyerToken))
        .send(offerPayload(first.positionId))
    ).body;
    await ctx.http.post(`/api/marketplace/offers/${offer.id}/accept`).set(bearer(seller.token));
    await ctx.http
      .post(`/api/marketplace/offers/${offer.id}/deal`)
      .set(bearer(seller.token))
      .send({ result: "agreed" });

    // Новое объявление того же продавца — доверие учитывает прошлую сделку.
    const second = await createPublishedListing(seller.token, nomenclatureId);
    const detail = await ctx.http.get(`/api/marketplace/listings/${second.listingId}`).set(bearer(buyerToken));
    expect(detail.body.seller.dealsCompleted).toBe(1);
  });
});
