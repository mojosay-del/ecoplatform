import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { NotificationsModule } from "../../notifications/notifications.module";
import { AdminBroadcastController } from "./admin-broadcast.controller";
import { AdminBroadcastService } from "./admin-broadcast.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [AdminBroadcastController],
  providers: [AdminBroadcastService, AdminActionLogService],
})
export class AdminBroadcastModule {}
