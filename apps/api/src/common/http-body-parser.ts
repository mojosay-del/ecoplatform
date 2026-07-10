import type { NestExpressApplication } from "@nestjs/platform-express";

// Единый лимит тела JSON-запроса. Дефолтный body-parser NestJS/Express режет
// тело на 100 КБ, а CMS шлёт статью/урок целиком — массивом блоков с
// HTML-параграфами и таблицами, — и длинный материал легко переваливает за
// 100 КБ, получая невнятный 413. Поднимаем до 2 МБ: с запасом на любой разумный
// текст, но без DoS-простора (загрузка медиа идёт отдельным multipart-роутом со
// своим лимитом 100 МБ и этого парсера не касается).
//
// Вынесено в общий хелпер, чтобы прод-бутстрап (main.ts) и integration-харнесс
// (test/test-app.ts) применяли ОДИН и тот же лимит — иначе тесты не
// воспроизводят прод-поведение по размеру тела.
export const JSON_BODY_LIMIT = "2mb";

export function configureBodyParser(app: NestExpressApplication): void {
  app.useBodyParser("json", { limit: JSON_BODY_LIMIT });
}
