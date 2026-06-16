import { describe, expect, it } from "vitest";
import { setupIntegrationContext } from "./test/integration-context";
import { bearer, createMarketplaceTestHelpers } from "./test/marketplace-integration-helpers";

const ctx = setupIntegrationContext();
const { registerCompany } = ctx;
const {
  agreedDeal,
  buyerScores,
  createPublishedListing,
  offerPayload,
  registerTrader,
  seedNomenclature,
  sellerScores,
} = createMarketplaceTestHelpers(ctx);

describe("Marketplace — отзывы и рейтинг (фаза 4)", () => {
  it("покупатель оценивает продавца; рейтинг считается по-яндексовски (старт-5★)", async () => {
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

  it("обе стороны оценивают друг друга по своим критериям", async () => {
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

  it("рейтинг компании требует активный доступ к площадке", async () => {
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

  it("неверный набор критериев и не-участник отклоняются", async () => {
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

  it("по несостоявшейся сделке отзыв оставить нельзя", async () => {
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

  it("ответ на отзыв — только адресат и один раз", async () => {
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

  it("автор удаляет свой отзыв в окне 3 мин; рейтинг сбрасывается", async () => {
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

  it("canReview на оффере: true после сделки, false после отзыва", async () => {
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
