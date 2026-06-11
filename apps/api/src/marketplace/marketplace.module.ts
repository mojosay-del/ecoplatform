import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ModuleAccessService } from "../common/module-access.service";
import { FilesModule } from "../files/files.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceGeocoderService } from "./services/marketplace-geocoder.service";
import { MarketplaceListingsService } from "./services/marketplace-listings.service";
import { MarketplaceOffersService } from "./services/marketplace-offers.service";
import { MarketplaceReviewsService } from "./services/marketplace-reviews.service";

// Торговая площадка (закрытый аукцион). Модуль строится по фазам: объявления →
// карта → закрытые предложения → отзывы. До публичного запуска скрыт за
// MarketplaceFeatureGuard (админы + флаг MARKETPLACE_ENABLED). Сервисы экспортируем
// — планировщик использует их cron-методы (авто-архив объявлений, авто-разрешение
// принятых предложений).
@Module({
  imports: [AuthModule, FilesModule, NotificationsModule],
  controllers: [MarketplaceController],
  providers: [
    ModuleAccessService,
    MarketplaceGeocoderService,
    MarketplaceListingsService,
    MarketplaceOffersService,
    MarketplaceReviewsService,
  ],
  exports: [MarketplaceListingsService, MarketplaceOffersService, MarketplaceReviewsService],
})
export class MarketplaceModule {}
