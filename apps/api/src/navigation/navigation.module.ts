import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminActionLogService } from "../common/admin-action-log.service";
import { NavigationController } from "./navigation.controller";
import { NavigationService } from "./navigation.service";
import { SectionVisibilityGuard } from "./section-visibility.guard";

// @Global, чтобы NavigationService и SectionVisibilityGuard были доступны в
// ContentModule (там guard навешан на публичные роуты) без циклических
// импортов. Паттерн повторяет PlatformSettingsModule.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [NavigationController],
  providers: [NavigationService, SectionVisibilityGuard, AdminActionLogService],
  exports: [NavigationService, SectionVisibilityGuard],
})
export class NavigationModule {}
