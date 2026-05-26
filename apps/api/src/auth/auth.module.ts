import { forwardRef, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { NotificationsModule } from "../notifications/notifications.module";
import { RedisModule } from "../redis/redis.module";
import { AuthDataExportService } from "./auth-data-export.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordPolicyService } from "./password-policy.service";

@Module({
  // forwardRef разрывает цикл AuthModule ↔ NotificationsModule:
  // notifications импортирует AuthModule ради JwtAuthGuard,
  // а authService инжектит NotificationsService для уведомлений безопасности.
  imports: [JwtModule.register({}), RedisModule, forwardRef(() => NotificationsModule)],
  controllers: [AuthController],
  providers: [AuthService, AuthDataExportService, PasswordPolicyService, JwtAuthGuard, RolesGuard],
  // JwtModule реэкспортируем, чтобы гварды, импортированные в другие модули,
  // могли получить JwtService через AuthModule.
  exports: [AuthService, PasswordPolicyService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
