import { Module, type ExecutionContext } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule, seconds } from "@nestjs/throttler";
import { LoggerModule } from "nestjs-pino";
import { AdminCompaniesModule } from "./admin/companies/admin-companies.module";
import { AdminJournalsModule } from "./admin/journals/admin-journals.module";
import { PlatformSettingsModule } from "./admin/settings/platform-settings.module";
import { AdminStaffModule } from "./admin/staff/admin-staff.module";
import { AdminUsersModule } from "./admin/users/admin-users.module";
import { AuthModule } from "./auth/auth.module";
import { BillingModule } from "./billing/billing.module";
import { ContentModule } from "./content/content.module";
import { FilesModule } from "./files/files.module";
import { HealthModule } from "./health/health.module";
import { LegalModule } from "./legal/legal.module";
import { ModerationModule } from "./moderation/moderation.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ObservabilityModule } from "./observability/observability.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { RedisThrottlerStorageService } from "./redis/redis-throttler-storage.service";
import { SchedulerModule } from "./scheduler/scheduler.module";
import { SupportModule } from "./support/support.module";
import { createLoggerModuleOptions } from "./common/logging";

const AUTH_THROTTLE_PATHS = new Set(["/api/auth/register", "/api/auth/login", "/api/auth/refresh"]);

function skipAuthThrottleOutsideAuthRoutes(context: ExecutionContext) {
  if (process.env.THROTTLER_DISABLED === "1") return true;
  const request = context.switchToHttp().getRequest<{ path?: string; originalUrl?: string; url?: string }>();
  const path = request.path ?? request.originalUrl?.split("?")[0] ?? request.url?.split("?")[0] ?? "";
  return !AUTH_THROTTLE_PATHS.has(path);
}

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerModuleOptions()),
    // Глобальный rate-limit. Дополнительный жёсткий лимит для /auth/* стоит
    // отдельным named-throttler и пропускается для всех остальных маршрутов.
    // Лимиты сознательно отключаем под integration-тестами, где сценарий
    // регистрация→login→refresh за секунды выбивает любой адекватный порог.
    RedisModule,
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisThrottlerStorageService],
      useFactory: (storage: RedisThrottlerStorageService) => ({
        storage,
        throttlers: [
          // короткое окно (антиспам): 30 запросов / 10 сек на IP.
          { name: "short", ttl: seconds(10), limit: 30 },
          // длинное окно: 600 / минуту — общий потолок устойчивости.
          { name: "long", ttl: seconds(60), limit: 600 },
          // отдельный, очень жёсткий ключ только для auth entrypoints.
          // Без skipIf named-throttler применился бы ко всем маршрутам и
          // обычные страницы упирались бы в 10 запросов/минуту.
          { name: "auth", ttl: seconds(60), limit: 10, skipIf: skipAuthThrottleOutsideAuthRoutes },
        ],
        skipIf: () => process.env.THROTTLER_DISABLED === "1",
      }),
    }),
    PrismaModule,
    PlatformSettingsModule,
    AuthModule,
    AdminCompaniesModule,
    AdminJournalsModule,
    AdminStaffModule,
    AdminUsersModule,
    BillingModule,
    ContentModule,
    FilesModule,
    HealthModule,
    LegalModule,
    ModerationModule,
    NotificationsModule,
    ObservabilityModule,
    SchedulerModule,
    SupportModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
