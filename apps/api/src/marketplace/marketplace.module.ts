import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FilesModule } from "../files/files.module";
import { MarketplaceController } from "./marketplace.controller";
import { MarketplaceListingsService } from "./services/marketplace-listings.service";

// Торговая площадка (закрытый аукцион). Модуль строится по фазам: объявления →
// карта → закрытые предложения → отзывы. До публичного запуска скрыт за
// MarketplaceFeatureGuard (админы + флаг MARKETPLACE_ENABLED). Сервис экспортируем
// — планировщик использует archiveExpired() для авто-архива истёкших объявлений.
@Module({
  imports: [AuthModule, FilesModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceListingsService],
  exports: [MarketplaceListingsService],
})
export class MarketplaceModule {}
