import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminActionLogService } from "../common/admin-action-log.service";
import { NotificationsModule } from "../notifications/notifications.module";
import { ForumAdminController } from "./forum-admin.controller";
import { ForumAdminService } from "./forum-admin.service";
import { ForumNudgeService } from "./forum-nudge.service";
import { ForumController } from "./forum.controller";
import { ForumService } from "./forum.service";

// Раздел «Форум» (Q&A сообщества) — самостоятельный модуль (как trip-calculator),
// а не часть content-сервисов: контент пользовательский, с голосами/подписками.
// AuthModule даёт guard'ы, NotificationsModule — уведомления об ответах.
// ForumNudgeService экспортируется для крон-пинга из SchedulerModule.
@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ForumController, ForumAdminController],
  providers: [ForumService, ForumAdminService, ForumNudgeService, AdminActionLogService],
  exports: [ForumNudgeService],
})
export class ForumModule {}
