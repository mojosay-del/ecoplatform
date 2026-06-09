import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceListingsService } from "./services/marketplace-listings.service";

// Торговая площадка (закрытый аукцион). Модуль строится по фазам: объявления →
// карта → закрытые предложения → отзывы. До публичного запуска скрыт за
// MarketplaceFeatureGuard (админы + флаг MARKETPLACE_ENABLED).
@Module({
  imports: [AuthModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceListingsService],
})
export class MarketplaceModule {}
