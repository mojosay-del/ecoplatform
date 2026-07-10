import cookieParser from "cookie-parser";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { csrfCookieMiddleware, CsrfGuard } from "./csrf.guard";
import { GlobalExceptionFilter } from "./global-exception.filter";
import { configureBodyParser } from "./http-body-parser";

// Единая настройка HTTP-слоя (request-pipeline), общая для прод-бутстрапа
// (main.ts) и integration-харнесса (test/test-app.ts). Раньше харнесс вручную
// повторял лишь часть настройки и молча расходился с продом — из-за чего тесты
// не воспроизводили прод-поведение (см. B1: лимит тела отсутствовал в тестах).
//
// Сюда входит то, что влияет на обработку запроса и должно быть одинаковым
// в бою и в тестах: глобальный префикс, лимит тела, cookie-parser, CSRF
// (double-submit middleware + guard) и глобальный exception-filter (единый
// формат ошибок + сан-ция 5xx без утечки stack).
//
// Прод-only транспортные слои (helmet, compression, CORS, trust proxy,
// graceful-shutdown, OpenAPI) остаются в main.ts: для supertest-тестов они
// не нужны и лишь добавляли бы шум.
export function configureHttpApp(app: NestExpressApplication): void {
  configureBodyParser(app);
  app.use(cookieParser());
  app.use(csrfCookieMiddleware);
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalGuards(new CsrfGuard());
}
