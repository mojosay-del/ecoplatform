import type { setupIntegrationContext } from "./integration-context";

type MarketplaceIntegrationContext = ReturnType<typeof setupIntegrationContext>;

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

export function createMarketplaceTestHelpers(ctx: MarketplaceIntegrationContext) {
  const { registerCompany, registerWithBody } = ctx;

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
    await ctx.http
      .post(`/api/marketplace/offers/${offer.id}/deal`)
      .set(bearer(seller.token))
      .send({ result: "agreed" });
    return {
      sellerToken: seller.token,
      sellerCompanyId: seller.companyId,
      buyerToken,
      buyerCompanyId: me.body.companyId as string,
      listingId,
      offerId: offer.id as string,
    };
  }

  return {
    agreedDeal,
    buyerScores,
    createPublishedListing,
    listingPayload,
    offerPayload,
    registerProcessor,
    registerTrader,
    seedNomenclature,
    seedPhotos,
    sellerScores,
  };
}
