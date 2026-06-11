import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ModuleAccessService } from "../common/module-access.service";
import { FilesModule } from "../files/files.module";
import { GeocodingModule } from "../geo/geocoding.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceListingsService } from "./services/marketplace-listings.service";
import { MarketplaceOffersService } from "./services/marketplace-offers.service";
import { MarketplaceReviewsService } from "./services/marketplace-reviews.service";

// Торговая площадка (закрытый аукцион). Модуль строится по фазам: объявления →
// карта → закрытые предложения → отзывы. Публичный доступ включает
// MarketplaceFeatureGuard через MARKETPLACE_ENABLED=1. Сервисы экспортируем —
// планировщик использует их cron-методы (авто-архив объявлений, авто-разрешение
// принятых предложений).
@Module({
  imports: [AuthModule, FilesModule, GeocodingModule, NotificationsModule],
  controllers: [MarketplaceController],
  providers: [ModuleAccessService, MarketplaceListingsService, MarketplaceOffersService, MarketplaceReviewsService],
  exports: [MarketplaceListingsService, MarketplaceOffersService, MarketplaceReviewsService],
})
export class MarketplaceModule {}
