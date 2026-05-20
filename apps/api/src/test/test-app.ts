// Helpers для integration-тестов: поднимает Nest-приложение в тестовом контексте,
// возвращает супертест-клиент и доступ к PrismaService для подготовки/очистки данных.

import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { AppModule } from "../app.module";
import { PrismaService } from "../prisma/prisma.service";

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  http: request.SuperTest<request.Test>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.use(cookieParser());
  await app.init();

  const prisma = app.get(PrismaService);
  const http = request(app.getHttpServer()) as unknown as request.SuperTest<request.Test>;

  return {
    app,
    prisma,
    http,
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
