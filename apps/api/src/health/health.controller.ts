import { Controller, Get, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { HealthCheck, HealthCheckService, type HealthCheckResult } from "@nestjs/terminus";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { HealthDependencyIndicator } from "./health-dependency.indicator";

// Health-эндпоинты для Timeweb / Docker / Kubernetes probes.
//
// /api/health — liveness: процесс отвечает. Если 200 не пришёл,
//   контейнер перезапускают. Зависимости тут не проверяем.
//
// /api/ready  — readiness: процесс готов принимать трафик. Проверяет
//   ключевые зависимости: Postgres, Redis и S3. Если 503, балансировщик
//   НЕ шлёт сюда запросы.
//
// /api/health/deep — детальная диагностика для админов: те же проверки
//   плюс безопасные технические детали.
//
// Эти эндпоинты вынесены из rate-limit: пробы стучатся
// часто, мы не хотим, чтобы они выбили лимит.
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dependencies: HealthDependencyIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @SkipThrottle({ short: true, long: true, auth: true })
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.dependencies.process("process")]);
  }

  @Get("deep")
  @HealthCheck()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @SkipThrottle({ short: true, long: true, auth: true })
  deep(): Promise<HealthCheckResult> {
    const options = { detailed: true };

    return this.health.check([
      () => this.dependencies.process("process", options),
      () => this.dependencies.database("database", options),
      () => this.dependencies.redisCache("redis", options),
      () => this.dependencies.objectStorage("s3", options),
      () => this.dependencies.emailDelivery("email", options),
    ]);
  }
}

@Controller("ready")
export class ReadyController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dependencies: HealthDependencyIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @SkipThrottle({ short: true, long: true, auth: true })
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.dependencies.database("database"),
      () => this.dependencies.redisCache("redis"),
      () => this.dependencies.objectStorage("s3"),
      () => this.dependencies.emailDelivery("email"),
    ]);
  }
}
