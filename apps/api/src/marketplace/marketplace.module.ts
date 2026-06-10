import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceListingsService } from "./services/marketplace-listings.service";
import { MarketplaceOffersService } from "./services/marketplace-offers.service";

// Торговая площадка (закрытый аукцион). Модуль строится по фазам: объявления →
// карта → закрытые предложения → отзывы. До публичного запуска скрыт за
// MarketplaceFeatureGuard (админы + флаг MARKETPLACE_ENABLED). Сервисы экспортируем
// — планировщик использует их cron-методы (авто-архив объявлений, авто-разрешение
// принятых предложений).
@Module({
  imports: [AuthModule, FilesModule, NotificationsModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceListingsService, MarketplaceOffersService],
  exports: [MarketplaceListingsService, MarketplaceOffersService],
})
export class MarketplaceModule {}
