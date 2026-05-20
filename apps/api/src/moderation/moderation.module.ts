import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminActionLogService } from "../common/admin-action-log.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { ModerationController } from "./moderation.controller";
import { ModerationService } from "./moderation.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ModerationController],
  providers: [ModerationService, AdminActionLogService],
})
export class ModerationModule {}
