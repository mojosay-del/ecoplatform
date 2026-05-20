import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { AdminSettingsController } from "./admin-settings.controller";
import { PlatformSettingsService } from "./platform-settings.service";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [AdminSettingsController],
  providers: [PlatformSettingsService, AdminActionLogService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
