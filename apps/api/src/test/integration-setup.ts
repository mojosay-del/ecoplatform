// Setup, выполняемый в каждом воркере перед каждым integration test-файлом.
// Глобальный setup уже подменил DATABASE_URL на тестовую БД.

import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(__dirname, "../../../../.env") });

// Integration-сценарии за секунды делают десятки register/login/refresh —
// прод-лимит в 10/мин уронил бы их. На прод этот флаг не выставляется.
process.env.THROTTLER_DISABLED = "1";
process.env.PWNED_PASSWORDS_CHECK_ENABLED = "0";
process.env.EMAIL_DELIVERY_DISABLED = "1";
process.env.EMAIL_VERIFICATION_TEST_CODE = "1234";
delete process.env.DADATA_API_KEY;

// DATABASE_URL приходит из globalSetup (process.env уже изменён в parent-процессе vitest).
if (!process.env.DATABASE_URL?.includes("_test")) {
  // Подстраховка: если тесты пытаются работать против dev-БД — лучше упасть с понятной ошибкой,
  // чем случайно затереть локальные данные при TRUNCATE.
  throw new Error(
    `Integration tests should target *_test database, got ${process.env.DATABASE_URL ?? "<undefined>"}. ` +
      "Check apps/api/vitest.integration.config.ts globalSetup.",
  );
}
