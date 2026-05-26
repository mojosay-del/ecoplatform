import { forwardRef, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { NotificationsModule } from "../notifications/notifications.module";
import { RedisModule } from "../redis/redis.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  // forwardRef разрывает цикл AuthModule ↔ NotificationsModule:
  // notifications импортирует AuthModule ради JwtAuthGuard,
  // а authService инжектит NotificationsService для уведомлений безопасности.
  imports: [JwtModule.register({}), RedisModule, forwardRef(() => NotificationsModule)],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  // JwtModule реэкспортируем, чтобы гварды, импортированные в другие модули,
  // могли получить JwtService через AuthModule.
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule],
})
export class AuthModule {}
