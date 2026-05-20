import "reflect-metadata";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

// Загружаем переменные окружения из корневого .env монорепы при старте процесса —
// чтобы Prisma, JWT и Nest могли читать их через process.env без явного экспорта.
loadEnv({ path: resolve(__dirname, "../../../.env") });

import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:3000",
    credentials: true,
  });

  await app.listen(Number(process.env.API_PORT ?? 4000));
}

void bootstrap();
