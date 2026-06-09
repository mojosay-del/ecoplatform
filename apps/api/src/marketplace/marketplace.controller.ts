import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { MarketplaceFeatureGuard } from "./marketplace-feature.guard";
import { marketplaceListQuerySchema } from "./marketplace.schemas";
import { MarketplaceListingsService } from "./services/marketplace-listings.service";

// Маршруты торговой площадки. Два гейта на контроллере: JwtAuthGuard (нужен
// авторизованный пользователь) и MarketplaceFeatureGuard («за закрытыми
// дверьми»: пока только админы, либо все при MARKETPLACE_ENABLED=1).
@UseGuards(JwtAuthGuard, MarketplaceFeatureGuard)
@Controller()
export class MarketplaceController {
  constructor(private readonly listings: MarketplaceListingsService) {}

  @Get("marketplace/listings")
  async listListings(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.listings.listPublic(user, parseBody(marketplaceListQuerySchema, query));
  }
}
