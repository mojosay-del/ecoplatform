// Helpers для integration-тестов: поднимает Nest-приложение в тестовом контексте,
// возвращает супертест-клиент и доступ к PrismaService для подготовки/очистки данных.

import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import { Logger as PinoNestLogger } from "nestjs-pino";
import request from "supertest";
import { AppModule } from "../app.module";
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, csrfCookieMiddleware, CsrfGuard } from "../common/csrf.guard";
import { PrismaService } from "../prisma/prisma.service";

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  http: request.SuperTest<request.Test>;
  rawHttp: request.SuperTest<request.Test>;
  close: () => Promise<void>;
}

const TEST_CSRF_TOKEN = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO12";
const UNSAFE_METHODS = new Set(["post", "patch", "delete", "put"]);

function withDefaultCsrf(http: request.SuperTest<request.Test>): request.SuperTest<request.Test> {
  return new Proxy(http, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property === "string" && UNSAFE_METHODS.has(property) && typeof value === "function") {
        return (...args: unknown[]) =>
          value
            .apply(target, args)
            .set("Cookie", `${CSRF_COOKIE_NAME}=${TEST_CSRF_TOKEN}`)
            .set(CSRF_HEADER_NAME, TEST_CSRF_TOKEN);
      }
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as request.SuperTest<request.Test>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useLogger(app.get(PinoNestLogger));
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.use(csrfCookieMiddleware);
  app.useGlobalGuards(new CsrfGuard());
  await app.init();

  const prisma = app.get(PrismaService);
  const rawHttp = request(app.getHttpServer()) as unknown as request.SuperTest<request.Test>;
  const http = withDefaultCsrf(rawHttp);

  return {
    app,
    prisma,
    http,
    rawHttp,
    close: async () => {
      await app.close();
    },
  };
}

// Очищает все таблицы между тестами в правильном порядке (учитывая FK).
export async function resetDb(prisma: PrismaService): Promise<void> {
  // Простая стратегия: TRUNCATE всех пользовательских таблиц одним выражением CASCADE.
  // Перечень таблиц получаем динамически из information_schema, чтобы не ломаться при добавлении новых моделей.
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
