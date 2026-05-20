import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SupportController } from "./support.controller";
import { SupportService } from "./support.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
