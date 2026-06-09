import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { createListingDtoSchema, updateListingDtoSchema } from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { MarketplaceFeatureGuard } from "./marketplace-feature.guard";
import { marketplaceListQuerySchema } from "./marketplace.schemas";
import { MarketplaceListingsService } from "./services/marketplace-listings.service";

// Маршруты торговой площадки. Два гейта на контроллере: JwtAuthGuard (нужен
// авторизованный пользователь) и MarketplaceFeatureGuard («за закрытыми
// дверьми»: пока только админы, либо все при MARKETPLACE_ENABLED=1). Доступ по
// подписке и роли заготовителя проверяет уже сервис.
@UseGuards(JwtAuthGuard, MarketplaceFeatureGuard)
@Controller()
export class MarketplaceController {
  constructor(private readonly listings: MarketplaceListingsService) {}

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
}
