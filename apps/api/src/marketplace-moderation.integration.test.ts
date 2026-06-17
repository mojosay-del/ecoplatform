import { beforeEach, describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";
import { bearer, createMarketplaceTestHelpers } from "./test/marketplace-integration-helpers";

const ctx = setupIntegrationContext();
const { loginAdmin, registerCompany } = ctx;
const {
  agreedDeal,
  buyerScores,
  createPublishedListing,
  enableMarketplace,
  listingPayload,
  offerPayload,
  registerProcessor,
  registerTrader,
  seedNomenclature,
  seedPhotos,
} = createMarketplaceTestHelpers(ctx);

beforeEach(enableMarketplace);

describe("Marketplace — модерация (фаза 5)", () => {
  it("жалоба на объявление: модератор снимает — оно уходит из ленты, переподача запрещена", async () => {
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
    const republish = await ctx.http.post(`/api/marketplace/listings/${listingId}/republish`).set(bearer(seller.token));
    expect(republish.status).toBe(403);
  });

  it("снятие объявления модератором отклоняет незавершённые офферы и блокирует их изменение", async () => {
    const seller = await registerCompany("0009505");
    const nomenclatureId = await seedNomenclature();
    const { listingId, positionId } = await createPublishedListing(seller.token, nomenclatureId);
    const buyerA = await registerTrader("0009505");
    const buyerB = await registerProcessor("0009505");

    const acceptedOffer = (
      await ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyerA))
        .send(offerPayload(positionId))
    ).body;
    await ctx.http.post(`/api/marketplace/offers/${acceptedOffer.id}/accept`).set(bearer(seller.token));

    const activeOffer = (
      await ctx.http
        .post(`/api/marketplace/listings/${listingId}/offers`)
        .set(bearer(buyerB))
        .send(offerPayload(positionId))
    ).body;

    const complaint = await ctx.http
      .post("/api/moderation/complaints")
      .set(bearer(buyerB))
      .send({ entityType: "marketplace_listing", entityId: listingId, reasonCode: "spam" });
    expect(complaint.status).toBe(201);

    const adminToken = await loginAdmin();
    const cases = await ctx.http.get("/api/admin/moderation/cases?limit=100").set(bearer(adminToken));
    const theCase = cases.body.items.find(
      (item) => item.entityType === "marketplace_listing" && item.entityId === listingId,
    );
    expect(theCase).toBeTruthy();

    await ctx.http.post(`/api/admin/moderation/cases/${theCase.id}/lock`).set(bearer(adminToken));
    const decision = await ctx.http
      .post(`/api/admin/moderation/cases/${theCase.id}/decisions`)
      .set(bearer(adminToken))
      .send({ type: "remove_content", reasonCode: "valid_complaint" });
    expect(decision.status).toBe(201);

    const offers = await ctx.prisma.offer.findMany({
      where: { id: { in: [acceptedOffer.id, activeOffer.id] } },
      select: { id: true, status: true, dealResult: true, resolvedAt: true },
    });
    const offersById = new Map(offers.map((offer) => [offer.id, offer]));
    expect(offersById.get(acceptedOffer.id)?.status).toBe("declined");
    expect(offersById.get(activeOffer.id)?.status).toBe("declined");
    expect(offersById.get(acceptedOffer.id)?.dealResult).toBeNull();
    expect(offersById.get(activeOffer.id)?.dealResult).toBeNull();
    expect(offersById.get(acceptedOffer.id)?.resolvedAt).toBeInstanceOf(Date);
    expect(offersById.get(activeOffer.id)?.resolvedAt).toBeInstanceOf(Date);

    const update = await ctx.http
      .patch(`/api/marketplace/offers/${activeOffer.id}`)
      .set(bearer(buyerB))
      .send(offerPayload(positionId, { contactPhone: "+79990000000" }));
    expect(update.status).toBe(400);
    expect(update.body.message).toBe("Объявление неактивно.");
  });

  it("жалоба на отзыв: модератор скрывает — отзыв исчезает, рейтинг компании пересчитан", async () => {
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

  it("санкция module_restriction(marketplace) блокирует размещение объявлений", async () => {
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

  it("санкция module_restriction(reviews) блокирует написание отзывов", async () => {
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
