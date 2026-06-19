import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

// Загружаем переменные окружения из корневого .env монорепы при старте процесса —
// чтобы Prisma, JWT и Nest могли читать их через process.env без явного экспорта.
loadEnv({ path: resolve(__dirname, "../../../.env") });

import { initializeApiSentry } from "./common/sentry";

initializeApiSentry();

import cookieParser from "cookie-parser";
import compression from "compression";
import helmet from "helmet";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Logger as PinoNestLogger } from "nestjs-pino";
import { AppModule } from "./app.module";
import { createCorsOrigin } from "./common/cors-origin";
import { csrfCookieMiddleware, CsrfGuard } from "./common/csrf.guard";
import { GlobalExceptionFilter, registerProcessErrorHandlers } from "./common/global-exception.filter";
import { FilesService } from "./files/files.service";

function assertSecret(name: string) {
  const value = process.env[name];
  // Минимум 32 символа: чтобы случайный dev-эксперимент не пролез в прод.
  // Без секрета JWT можно подделать → нельзя стартовать.
  if (!value || value.length < 32) {
    throw new Error(`Переменная окружения ${name} не задана или короче 32 символов.`);
  }
}

async function bootstrap() {
  assertSecret("JWT_ACCESS_SECRET");
  assertSecret("JWT_REFRESH_SECRET");

  // Ловим unhandledRejection / uncaughtException на уровне процесса.
  // Без этого Node новых версий молча убивает процесс, и админ видит только
  // SIGKILL в supervisor-логе.
  registerProcessErrorHandlers();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const appLogger = app.get(PinoNestLogger);
  app.useLogger(appLogger);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());

  // Все 5xx/4xx будут логироваться единообразно с URL, методом, actorId и
  // (для 5xx) stack-трейсом. См. GlobalExceptionFilter.
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.use(csrfCookieMiddleware);
  app.useGlobalGuards(new CsrfGuard());
  // За reverse-proxy Timeweb/nginx — иначе request.ip = IP балансировщика
  // и журнал сессий/будущий rate-limit будут привязаны к одной точке.
  app.set("trust proxy", 1);
  app.enableCors({
    origin: createCorsOrigin(),
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", "X-CSRF-Token"],
    // CORS-preflight кешируется браузером на сутки — иначе на каждый запрос
    // улетает лишний OPTIONS.
    maxAge: 86_400,
  });
  // Без этого SIGTERM при rolling-deploy не доходит до OnModuleDestroy,
  // и PrismaService не закрывает соединения — теряем connection-slot'ы в Postgres.
  app.enableShutdownHooks();

  // Backfill FileReference при первом запуске после миграции perf/file_reference.
  // Идемпотентно: если таблица уже не пустая, сразу выходит. Без await
  // — чтобы старт API не задерживался на больших БД (новые операции и так
  // уже корректно ведут FileReference).
  const files = app.get(FilesService);
  void files
    .backfillFileReferencesIfNeeded()
    .then((result) => {
      if (result.scanned > 0) {
        appLogger.log(`FileReference backfill scanned ${result.scanned} entities`, "Bootstrap");
      }
    })
    .catch((error) => {
      const stack = error instanceof Error ? error.stack : String(error);
      appLogger.error("FileReference backfill failed", stack, "Bootstrap");
    });

  await app.listen(Number(process.env.API_PORT ?? 4000));
}

void bootstrap();
