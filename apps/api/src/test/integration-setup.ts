// Setup, выполняемый в каждом воркере перед каждым integration test-файлом.
// Глобальный setup уже подменил DATABASE_URL на тестовую БД.

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { assertLocalTestDatabase } from "./integration-global-setup";

loadEnv({ path: resolve(__dirname, "../../../../.env") });

// Integration-сценарии за секунды делают десятки register/login/refresh —
// прод-лимит в 10/мин уронил бы их. На прод этот флаг не выставляется.
process.env.THROTTLER_DISABLED = "1";
process.env.PWNED_PASSWORDS_CHECK_ENABLED = "0";
process.env.EMAIL_DELIVERY_DISABLED = "1";
process.env.EMAIL_VERIFICATION_TEST_CODE = "1234";
delete process.env.DADATA_API_KEY;

// C7: локально `.env` указывает на БОЕВОЙ S3 — без этой подмены integration-тесты
// слали бы DeleteObject на прод-бакет (риск случайного удаления при совпадении
// ключа). Форсим фейковый недостижимый endpoint (как в CI). Тестам реальный S3
// не нужен: presigned-ссылки — локальная криптоподпись (сети нет), а удаление
// объектов best-effort и глотает сетевые ошибки (см. files-cleanup.helpers).
// Реальных upload/GetObject в integration-тестах нет.
process.env.S3_ENDPOINT = "https://s3.example.test";
process.env.S3_PUBLIC_BASE_URL = "https://s3.example.test";
process.env.S3_REGION = "ru-1";
process.env.S3_BUCKET = "ci-test";
process.env.S3_ACCESS_KEY_ID = "ci-key";
process.env.S3_SECRET_ACCESS_KEY = "ci-secret";
process.env.S3_PRIVATE_BUCKET = "ci-test-private";

// DATABASE_URL приходит из globalSetup (process.env уже изменён в parent-процессе vitest).
// Эшелонированная оборона (см. global-setup): (1) только loopback-хост — прод/
// удалённая БД недостижимы; (2) имя БД обязано содержать `_test` — не dev.
if (process.env.DATABASE_URL) {
  assertLocalTestDatabase(process.env.DATABASE_URL);
}
if (!process.env.DATABASE_URL?.includes("_test")) {
  // Если тесты пытаются работать против dev-БД (без суффикса _test) — падаем с
  // понятной ошибкой, чтобы не затереть локальные данные при TRUNCATE.
  throw new Error(
    `Integration tests should target *_test database, got ${process.env.DATABASE_URL ?? "<undefined>"}. ` +
      "Check apps/api/vitest.integration.config.ts globalSetup.",
  );
}
