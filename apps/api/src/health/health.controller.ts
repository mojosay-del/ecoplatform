import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { HealthCheck, HealthCheckService, type HealthCheckResult } from "@nestjs/terminus";
import { PrismaService } from "../prisma/prisma.service";

// Health-эндпоинты для Timeweb / Docker / Kubernetes probes.
//
// /api/health — liveness: процесс отвечает. Если 200 не пришёл,
//   контейнер перезапускают.
//
// /api/ready  — readiness: процесс готов принимать трафик. Проверяет
//   ключевые зависимости (сейчас — Postgres через `SELECT 1`). Если 503,
//   балансировщик НЕ шлёт сюда запросы.
//
// Оба эндпоинта вынесены из rate-limit: пробы стучатся
// часто, мы не хотим, чтобы они выбили лимит.
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @SkipThrottle({ short: true, long: true, auth: true })
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }
}

@Controller("ready")
export class ReadyController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @SkipThrottle({ short: true, long: true, auth: true })
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      async () => {
        // Лёгкий ping Postgres. Если соединение мертво — readiness падает,
        // балансировщик уводит трафик до восстановления.
        await this.prisma.$queryRaw`SELECT 1`;
        return { database: { status: "up" } };
      },
    ]);
  }
}
