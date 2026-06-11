import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminActionLogService } from "../common/admin-action-log.service";
import { ModuleAccessService } from "../common/module-access.service";
import { MarketplaceModule } from "../marketplace/marketplace.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RedisModule } from "../redis/redis.module";
import { ModerationController } from "./moderation.controller";
import { ModerationService } from "./moderation.service";

// MarketplaceModule импортируем ради MarketplaceReviewsService: при скрытии
// отзыва модератором нужно пересчитать рейтинг компании. Связь односторонняя —
// маркетплейс модерацию не импортирует, цикла нет.
@Module({
  imports: [AuthModule, NotificationsModule, RedisModule, MarketplaceModule],
  controllers: [ModerationController],
  providers: [ModerationService, AdminActionLogService, ModuleAccessService],
})
export class ModerationModule {}
