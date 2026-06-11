import { describe, expect, it } from "vitest";
import { MarketplaceListingsService } from "./marketplace/services/marketplace-listings.service";
import { MarketplaceOffersService } from "./marketplace/services/marketplace-offers.service";
import { setupIntegrationContext } from "./test/integration-context";
import { expectPaginatedEnvelope, withEnv } from "./test/integration-helpers";

// MARKETPLACE_ENABLED=1 открывает торговую площадку всем авторизованным
// пользователям. Если флаг выключен, раздел остаётся доступен только админам
// для служебной проверки.
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
    positions: [
      {
        nomenclatureId,
        weightKg: 1500,
        form: "pressed",
        packaging: "Палет",
        moistureCondition: "slightly_wet",
        contaminationCondition: "may_have_inclusions",
      },
    ],
    address: { city: "Москва", region: "Москва" },
    contactPhone: "+79991234567",
    typicalLoadKg: 20000,
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

async function registerProcessor(suffix: string): Promise<string> {
  return registerWithBody({
    organizationName: `ООО Переработка ${suffix}`,
    companyType: "processor",
    firstName: "Семён",
    lastName: "Переработкин",
    gender: "male",
    phone: `+7902${suffix}`,
    email: `proc${suffix}@test.local`,
    password: "User12345678",
  });
}

async function createPublishedListing(sellerToken: string, nomenclatureId: string) {
  const photos = await seedPhotos(4);
  const draft = await ctx.http
    .post("/api/marketplace/listings")
    .set(bearer(sellerToken))
    .send(listingPayload(nomenclatureId, photos));
  await ctx.http.post(`/api/marketplace/listings/${draft.body.id}/publish`).set(bearer(sellerToken));
  return { listingId: draft.body.id as string, positionId: draft.body.positions[0].id as string };
}

function offerPayload(listingPositionId: string, overrides: Record<string, unknown> = {}) {
  return {
    priceCondition: "from_place",
    contactPhone: "+79995554433",
    positions: [{ listingPositionId, pricePerTonRub: 12_500 }],
    ...overrides,
  };
}

function buyerScores(value = 5) {
  return [
    { criterion: "quality", score: value },
    { criterion: "weight_accuracy", score: value },
    { criterion: "shipping_speed", score: value },
    { criterion: "reliability", score: value },
  ];
}

function sellerScores(value = 5) {
  return [
    { criterion: "payment_speed", score: value },
    { criterion: "terms_adherence", score: value },
    { criterion: "reliability", score: value },
  ];
}

// Доводит сделку до «Договорились» и возвращает токены/компании/offerId.
async function agreedDeal(sellerSuffix: string, buyerSuffix: string) {
  const seller = await registerCompany(sellerSuffix);
  const nomenclatureId = await seedNomenclature();
  const { listingId, positionId } = await createPublishedListing(seller.token, nomenclatureId);
  const buyerToken = await registerTrader(buyerSuffix);
  const me = await ctx.http.get("/api/auth/me").set(bearer(buyerToken));
  const offer = (
    await ctx.http
      .post(`/api/marketplace/listings/${listingId}/offers`)
      .set(bearer(buyerToken))
      .send(offerPayload(positionId))
  ).body;
  await ctx.http.post(`/api/marketplace/offers/${offer.id}/accept`).set(bearer(seller.token));
  await ctx.http.post(`/api/marketplace/offers/${offer.id}/deal`).set(bearer(seller.token)).send({ result: "agreed" });
  return {
    sellerToken: seller.token,
    sellerCompanyId: seller.companyId,
    buyerToken,
    buyerCompanyId: me.body.companyId as string,
    listingId,
    offerId: offer.id as string,
  };
}

describe("Marketplace — публичный доступ", () => {
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
      expect(draft.body.packaging).toBe("Палет");
      expect(draft.body.positions[0].packaging).toBe("Палет");
      expect(draft.body.positions[0].moistureCondition).toBe("slightly_wet");
      expect(draft.body.positions[0].contaminationCondition).toBe("may_have_inclusions");

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

  it("categorySlug в ленте + объём в машину в детали (UI-батч)", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const seller = await registerCompany("0009110");
      const nomenclatureId = await seedNomenclature();
      const { listingId } = await createPublishedListing(seller.token, nomenclatureId);

      const detail = await ctx.http.get(`/api/marketplace/listings/${listingId}`).set(bearer(seller.token));
      expect(detail.status).toBe(200);
      expect(detail.body.typicalLoadKg).toBe(20000);
      expect(detail.body.positions[0].categorySlug).toBe("makulatura");

      const feed = await ctx.http.get("/api/marketplace/listings").set(bearer(seller.token));
      expect(feed.body.items[0].positions[0].categorySlug).toBe("makulatura");
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

  it("админ видит чужое объявление как НЕ владелец, но с контактами (isOwner≠canSeeContacts)", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
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

describe("Marketplace — предложения и аукцион (фаза 3)", () => {
  it("полный цикл: предложение → принятие (раскрытие контактов) → «Договорились» → продано", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
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
  });

  it("один активный оффер на покупателя+объявление; заготовитель не может предлагать", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
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
  });

  it("параллельные запросы одного покупателя создают только один активный оффер", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const { token: sellerToken } = await registerCompany("0009213");
      const nomenclatureId = await seedNomenclature();
      const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
      const buyerToken = await registerTrader("0009213");

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

      expect([first.status, second.status].sort((left, right) => left - right)).toEqual([201, 400]);
      const activeOffers = await ctx.prisma.offer.count({
        where: { listingId, status: { in: ["active", "accepted"] } },
      });
      expect(activeOffers).toBe(1);
    });
  });

  it("параллельное принятие не оставляет два принятых оффера по объявлению", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
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
  });

  it("«Не договорились» оставляет объявление активным и закрывает оффер", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
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
  });

  it("«Договорились» отклоняет предложения конкурентов", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
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
  });

  it("чужой оффер нельзя отозвать или принять не своему объявлению", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
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
  });

  it("валидация: «на воротах» требует город; нужна цена хотя бы по одной позиции", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
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
  });

  it("cron авто-разрешает принятые предложения без решения за 24ч (объявление → not_settled)", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
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
  });
});

describe("Marketplace — отзывы и рейтинг (фаза 4)", () => {
  it("покупатель оценивает продавца; рейтинг считается по-яндексовски (старт-5★)", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const deal = await agreedDeal("0009301", "0009301");

      const review = await ctx.http
        .post(`/api/marketplace/offers/${deal.offerId}/reviews`)
        .set(bearer(deal.buyerToken))
        .send({ scores: buyerScores(4), comment: "норм" });
      expect(review.status).toBe(201);
      expect(review.body.direction).toBe("buyer_to_seller");
      expect(review.body.overall).toBe(4);

      const rating = await ctx.http
        .get(`/api/marketplace/companies/${deal.sellerCompanyId}/rating`)
        .set(bearer(deal.buyerToken));
      expect(rating.body.reviewCount).toBe(1);
      // (старт 5 + отзыв 4) / 2 = 4.5
      expect(rating.body.overall).toBe(4.5);

      const dup = await ctx.http
        .post(`/api/marketplace/offers/${deal.offerId}/reviews`)
        .set(bearer(deal.buyerToken))
        .send({ scores: buyerScores(4) });
      expect(dup.status).toBe(400);
    });
  });

  it("обе стороны оценивают друг друга по своим критериям", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const deal = await agreedDeal("0009302", "0009302");
      await ctx.http
        .post(`/api/marketplace/offers/${deal.offerId}/reviews`)
        .set(bearer(deal.buyerToken))
        .send({ scores: buyerScores(5) });

      const sellerReview = await ctx.http
        .post(`/api/marketplace/offers/${deal.offerId}/reviews`)
        .set(bearer(deal.sellerToken))
        .send({ scores: sellerScores(5) });
      expect(sellerReview.status).toBe(201);
      expect(sellerReview.body.direction).toBe("seller_to_buyer");

      const buyerRating = await ctx.http
        .get(`/api/marketplace/companies/${deal.buyerCompanyId}/rating`)
        .set(bearer(deal.sellerToken));
      expect(buyerRating.body.reviewCount).toBe(1);
      expect(buyerRating.body.overall).toBe(5);
    });
  });

  it("рейтинг компании требует активный доступ к площадке", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const deal = await agreedDeal("0009308", "0009308");

      const allowed = await ctx.http
        .get(`/api/marketplace/companies/${deal.sellerCompanyId}/rating`)
        .set(bearer(deal.buyerToken));
      expect(allowed.status).toBe(200);

      const expired = await registerCompany("0009318");
      await ctx.prisma.company.update({
        where: { id: expired.companyId },
        data: { demoEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });
      const login = await ctx.http
        .post("/api/auth/login")
        .send({ email: "user0009318@test.local", password: "User12345678" });
      expect(login.status).toBe(201);

      const denied = await ctx.http
        .get(`/api/marketplace/companies/${deal.sellerCompanyId}/rating`)
        .set(bearer(login.body.accessToken));
      expect(denied.status).toBe(403);
    });
  });

  it("неверный набор критериев и не-участник отклоняются", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const deal = await agreedDeal("0009303", "0009303");

      // покупатель присылает критерии продавца → 400
      const wrong = await ctx.http
        .post(`/api/marketplace/offers/${deal.offerId}/reviews`)
        .set(bearer(deal.buyerToken))
        .send({ scores: sellerScores(5) });
      expect(wrong.status).toBe(400);

      // посторонняя компания → 403
      const stranger = await registerTrader("0009313");
      const forbidden = await ctx.http
        .post(`/api/marketplace/offers/${deal.offerId}/reviews`)
        .set(bearer(stranger))
        .send({ scores: buyerScores(5) });
      expect(forbidden.status).toBe(403);
    });
  });

  it("по несостоявшейся сделке отзыв оставить нельзя", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const { token: sellerToken } = await registerCompany("0009304");
      const nomenclatureId = await seedNomenclature();
      const { listingId, positionId } = await createPublishedListing(sellerToken, nomenclatureId);
      const buyerToken = await registerTrader("0009304");
      const offer = (
        await ctx.http
          .post(`/api/marketplace/listings/${listingId}/offers`)
          .set(bearer(buyerToken))
          .send(offerPayload(positionId))
      ).body;

      const review = await ctx.http
        .post(`/api/marketplace/offers/${offer.id}/reviews`)
        .set(bearer(buyerToken))
        .send({ scores: buyerScores(5) });
      expect(review.status).toBe(400);
    });
  });

  it("ответ на отзыв — только адресат и один раз", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const deal = await agreedDeal("0009305", "0009305");
      const review = (
        await ctx.http
          .post(`/api/marketplace/offers/${deal.offerId}/reviews`)
          .set(bearer(deal.buyerToken))
          .send({ scores: buyerScores(4) })
      ).body;

      const authorResponse = await ctx.http
        .post(`/api/marketplace/reviews/${review.id}/response`)
        .set(bearer(deal.buyerToken))
        .send({ text: "сам себе" });
      expect(authorResponse.status).toBe(403);

      const response = await ctx.http
        .post(`/api/marketplace/reviews/${review.id}/response`)
        .set(bearer(deal.sellerToken))
        .send({ text: "Спасибо за сделку" });
      expect(response.status).toBe(201);
      expect(response.body.response?.text).toBe("Спасибо за сделку");

      const second = await ctx.http
        .post(`/api/marketplace/reviews/${review.id}/response`)
        .set(bearer(deal.sellerToken))
        .send({ text: "ещё раз" });
      expect(second.status).toBe(400);
    });
  });

  it("автор удаляет свой отзыв в окне 3 мин; рейтинг сбрасывается", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const deal = await agreedDeal("0009306", "0009306");
      const review = (
        await ctx.http
          .post(`/api/marketplace/offers/${deal.offerId}/reviews`)
          .set(bearer(deal.buyerToken))
          .send({ scores: buyerScores(5) })
      ).body;

      const del = await ctx.http.delete(`/api/marketplace/reviews/${review.id}`).set(bearer(deal.buyerToken));
      expect(del.status).toBe(200);

      const rating = await ctx.http
        .get(`/api/marketplace/companies/${deal.sellerCompanyId}/rating`)
        .set(bearer(deal.buyerToken));
      expect(rating.body.reviewCount).toBe(0);
      expect(rating.body.overall).toBeNull();
    });
  });

  it("canReview на оффере: true после сделки, false после отзыва", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const deal = await agreedDeal("0009307", "0009307");

      const before = await ctx.http.get("/api/marketplace/my/offers").set(bearer(deal.buyerToken));
      expect(before.body.items[0].canReview).toBe(true);

      await ctx.http
        .post(`/api/marketplace/offers/${deal.offerId}/reviews`)
        .set(bearer(deal.buyerToken))
        .send({ scores: buyerScores(5) });

      const after = await ctx.http.get("/api/marketplace/my/offers").set(bearer(deal.buyerToken));
      expect(after.body.items[0].canReview).toBe(false);
    });
  });
});

describe("Marketplace — карта и фильтры (фаза 2)", () => {
  it("адресные подсказки без ключа геокодера мягко возвращают пустой список", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1", YANDEX_GEOCODER_API_KEY: undefined }, async () => {
      const { token } = await registerCompany("0009399");

      const res = await ctx.http.get("/api/marketplace/address-suggest?q=Москва").set(bearer(token));

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  it("фильтры по региону/сырью + список регионов; без ключа геокодера круг пуст", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1", YANDEX_GEOCODER_API_KEY: undefined }, async () => {
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
      expect(regions.body).toEqual(expect.arrayContaining(["Москва", "Санкт-Петербург"]));
    });
  });
});

describe("Marketplace — модерация (фаза 5)", () => {
  it("жалоба на объявление: модератор снимает — оно уходит из ленты, переподача запрещена", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const seller = await registerCompany("0009501");
      const nomenclatureId = await seedNomenclature();
      const { listingId } = await createPublishedListing(seller.token, nomenclatureId);

      // На своё объявление пожаловаться нельзя.
      const selfReport = await ctx.http
        .post("/api/moderation/complaints")
        .set(bearer(seller.token))
        .send({ entityType: "marketplace_listing", entityId: listingId, reasonCode: "spam" });
      expect(selfReport.status).toBe(403);

      // Покупатель жалуется — кейс попадает в общую очередь модерации.
      const buyerToken = await registerTrader("0009501");
      const complaint = await ctx.http
        .post("/api/moderation/complaints")
        .set(bearer(buyerToken))
        .send({ entityType: "marketplace_listing", entityId: listingId, reasonCode: "spam" });
      expect(complaint.status).toBe(201);

      const adminToken = await loginAdmin();
      const cases = await ctx.http.get("/api/admin/moderation/cases?limit=100").set(bearer(adminToken));
      const theCase = cases.body.items.find(
        (item) => item.entityType === "marketplace_listing" && item.entityId === listingId,
      );
      expect(theCase).toBeTruthy();
      expect(theCase.entity?.type).toBe("marketplace_listing");

      // Модератор снимает контент.
      await ctx.http.post(`/api/admin/moderation/cases/${theCase.id}/lock`).set(bearer(adminToken));
      const decision = await ctx.http
        .post(`/api/admin/moderation/cases/${theCase.id}/decisions`)
        .set(bearer(adminToken))
        .send({ type: "remove_content", reasonCode: "valid_complaint" });
      expect(decision.status).toBe(201);

      // Объявление архивировано «модератором» и пропало из ленты.
      const stored = await ctx.prisma.marketplaceListing.findUnique({ where: { id: listingId } });
      expect(stored?.status).toBe("archived");
      expect(stored?.archiveReason).toBe("removed_by_moderator");

      const feed = await ctx.http.get("/api/marketplace/listings").set(bearer(buyerToken));
      expect(feed.body.items.find((item) => item.id === listingId)).toBeUndefined();

      // Снятое модератором объявление переподать нельзя (обход модерации).
      const republish = await ctx.http
        .post(`/api/marketplace/listings/${listingId}/republish`)
        .set(bearer(seller.token));
      expect(republish.status).toBe(403);
    });
  });

  it("жалоба на отзыв: модератор скрывает — отзыв исчезает, рейтинг компании пересчитан", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const deal = await agreedDeal("0009502", "0009502");
      const review = await ctx.http
        .post(`/api/marketplace/offers/${deal.offerId}/reviews`)
        .set(bearer(deal.buyerToken))
        .send({ scores: buyerScores(5) });
      expect(review.status).toBe(201);
      const reviewId = review.body.id as string;

      const ratingBefore = await ctx.http
        .get(`/api/marketplace/companies/${deal.sellerCompanyId}/rating`)
        .set(bearer(deal.buyerToken));
      expect(ratingBefore.body.reviewCount).toBe(1);

      // Адресат отзыва жалуется на него (не свой материал — отзыв чужого авторства).
      const complaint = await ctx.http
        .post("/api/moderation/complaints")
        .set(bearer(deal.sellerToken))
        .send({ entityType: "marketplace_review", entityId: reviewId, reasonCode: "false_information" });
      expect(complaint.status).toBe(201);

      const adminToken = await loginAdmin();
      const cases = await ctx.http.get("/api/admin/moderation/cases?limit=100").set(bearer(adminToken));
      const theCase = cases.body.items.find(
        (item) => item.entityType === "marketplace_review" && item.entityId === reviewId,
      );
      expect(theCase).toBeTruthy();
      await ctx.http.post(`/api/admin/moderation/cases/${theCase.id}/lock`).set(bearer(adminToken));
      await ctx.http
        .post(`/api/admin/moderation/cases/${theCase.id}/decisions`)
        .set(bearer(adminToken))
        .send({ type: "remove_content", reasonCode: "valid_complaint" });

      // Отзыв скрыт, исчез из ленты компании, рейтинг пересчитан до нуля отзывов.
      const stored = await ctx.prisma.marketplaceReview.findUnique({ where: { id: reviewId } });
      expect(stored?.status).toBe("hidden_by_moderator");

      const list = await ctx.http
        .get(`/api/marketplace/companies/${deal.sellerCompanyId}/reviews`)
        .set(bearer(deal.buyerToken));
      expect(list.body.find((item) => item.id === reviewId)).toBeUndefined();

      const ratingAfter = await ctx.http
        .get(`/api/marketplace/companies/${deal.sellerCompanyId}/rating`)
        .set(bearer(deal.buyerToken));
      expect(ratingAfter.body.reviewCount).toBe(0);
    });
  });

  it("санкция module_restriction(marketplace) блокирует размещение объявлений", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const seller = await registerCompany("0009503");
      const nomenclatureId = await seedNomenclature();
      await ctx.prisma.userModuleRestriction.create({
        data: {
          userId: seller.userId,
          moduleCode: "marketplace",
          reasonCode: "repeated_violation",
          appliedById: seller.userId,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      const photos = await seedPhotos(4);
      const draft = await ctx.http
        .post("/api/marketplace/listings")
        .set(bearer(seller.token))
        .send(listingPayload(nomenclatureId, photos));
      expect(draft.status).toBe(403);
    });
  });

  it("санкция module_restriction(reviews) блокирует написание отзывов", async () => {
    await withEnv({ MARKETPLACE_ENABLED: "1" }, async () => {
      const deal = await agreedDeal("0009504", "0009504");
      const buyerMe = await ctx.http.get("/api/auth/me").set(bearer(deal.buyerToken));
      await ctx.prisma.userModuleRestriction.create({
        data: {
          userId: buyerMe.body.id,
          moduleCode: "reviews",
          reasonCode: "repeated_violation",
          appliedById: buyerMe.body.id,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      const blockedReview = await ctx.http
        .post(`/api/marketplace/offers/${deal.offerId}/reviews`)
        .set(bearer(deal.buyerToken))
        .send({ scores: buyerScores(5) });
      expect(blockedReview.status).toBe(403);
    });
  });
});
