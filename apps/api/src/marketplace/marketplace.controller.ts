import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import {
  createListingDtoSchema,
  createOfferDtoSchema,
  createReviewDtoSchema,
  dealDecisionDtoSchema,
  reviewResponseDtoSchema,
  updateListingDtoSchema,
} from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { MarketplaceFeatureGuard } from "./marketplace-feature.guard";
import { marketplaceListQuerySchema } from "./marketplace.schemas";
import { MarketplaceGeocoderService } from "./services/marketplace-geocoder.service";
import { MarketplaceListingsService } from "./services/marketplace-listings.service";
import { MarketplaceOffersService } from "./services/marketplace-offers.service";
import { MarketplaceReviewsService } from "./services/marketplace-reviews.service";

const addressSuggestQuerySchema = z.object({
  q: z.string().trim().min(3).max(200),
});

// Маршруты торговой площадки. Два гейта на контроллере: JwtAuthGuard (нужен
// авторизованный пользователь) и MarketplaceFeatureGuard (публичный запуск через
// MARKETPLACE_ENABLED=1, иначе только админы). Доступ по подписке и роли
// заготовителя проверяет уже сервис.
@UseGuards(JwtAuthGuard, MarketplaceFeatureGuard)
@Controller()
export class MarketplaceController {
  constructor(
    private readonly listings: MarketplaceListingsService,
    private readonly offers: MarketplaceOffersService,
    private readonly reviews: MarketplaceReviewsService,
    private readonly geocoder: MarketplaceGeocoderService,
  ) {}

  @Get("marketplace/listings")
  async listListings(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.listings.listPublic(user, parseBody(marketplaceListQuerySchema, query));
  }

  @Get("marketplace/my/listings")
  async myListings(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.listings.listMine(user, parseBody(marketplaceListQuerySchema, query));
  }

  @Get("marketplace/nomenclature")
  async nomenclature(@CurrentUser() user: RequestUser) {
    return this.listings.listNomenclature(user);
  }

  @Get("marketplace/regions")
  async regions(@CurrentUser() user: RequestUser) {
    return this.listings.listRegions(user);
  }

  @Get("marketplace/address-suggest")
  async addressSuggest(@Query() query: Record<string, unknown>) {
    const input = parseBody(addressSuggestQuerySchema, query);
    return this.geocoder.suggest(input.q);
  }

  @Get("marketplace/listings/:id")
  async listingDetail(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.listings.getDetail(user, id);
  }

  @Post("marketplace/listings")
  async createListing(@CurrentUser() user: RequestUser, @Body() body: unknown) {
    return this.listings.createDraft(user, parseBody(createListingDtoSchema, body));
  }

  @Patch("marketplace/listings/:id")
  async updateListing(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    return this.listings.update(user, id, parseBody(updateListingDtoSchema, body));
  }

  @Post("marketplace/listings/:id/publish")
  async publishListing(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.listings.publish(user, id);
  }

  @Post("marketplace/listings/:id/archive")
  async archiveListing(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.listings.archive(user, id);
  }

  @Post("marketplace/listings/:id/republish")
  async republishListing(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.listings.republish(user, id);
  }

  // ── Предложения ───────────────────────────────────────────────────────────

  @Get("marketplace/my/offers")
  async myOffers(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.offers.listMyOffers(user, parseBody(marketplaceListQuerySchema, query));
  }

  @Post("marketplace/listings/:id/offers")
  async createOffer(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    return this.offers.createOffer(user, id, parseBody(createOfferDtoSchema, body));
  }

  @Get("marketplace/listings/:id/offers")
  async listingOffers(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.offers.listListingOffers(user, id);
  }

  @Patch("marketplace/offers/:id")
  async updateOffer(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    return this.offers.updateOffer(user, id, parseBody(createOfferDtoSchema, body));
  }

  @Post("marketplace/offers/:id/withdraw")
  async withdrawOffer(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.offers.withdrawOffer(user, id);
  }

  @Post("marketplace/offers/:id/accept")
  async acceptOffer(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.offers.acceptOffer(user, id);
  }

  @Post("marketplace/offers/:id/deal")
  async recordDeal(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    return this.offers.recordDeal(user, id, parseBody(dealDecisionDtoSchema, body));
  }

  // ── Отзывы и рейтинг ──────────────────────────────────────────────────────

  @Post("marketplace/offers/:id/reviews")
  async createReview(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    return this.reviews.createReview(user, id, parseBody(createReviewDtoSchema, body));
  }

  @Delete("marketplace/reviews/:id")
  async deleteReview(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.reviews.deleteOwnReview(user, id);
  }

  @Post("marketplace/reviews/:id/response")
  async respondReview(@CurrentUser() user: RequestUser, @Param("id") id: string, @Body() body: unknown) {
    return this.reviews.respondToReview(user, id, parseBody(reviewResponseDtoSchema, body));
  }

  @Get("marketplace/companies/:id/reviews")
  async companyReviews(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.reviews.getCompanyReviews(user, id);
  }

  @Get("marketplace/companies/:id/rating")
  async companyRating(@CurrentUser() user: RequestUser, @Param("id") id: string) {
    return this.reviews.getCompanyRating(user, id);
  }
}
