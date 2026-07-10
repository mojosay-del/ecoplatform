// Глобальный setup integration-тестов: создаёт тестовую БД и накатывает миграции один раз перед всеми тестами.
// Запускается vitest до того, как любой test-файл начнёт исполняться.

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { Client } from "pg";
import { execSync } from "child_process";

loadEnv({ path: resolve(__dirname, "../../../../.env") });

function parseDatabaseUrl(url: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || "5432"),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

// 🔒 КРИТИЧЕСКАЯ ЗАЩИТА: integration-тесты создают/мигрируют/TRUNCATE'ят БД.
// Разрешаем их ТОЛЬКО против локальной БД (loopback-хост). Прод и любой
// удалённый Postgres (напр. Timeweb 192.168.0.5) — недостижимы отсюда by design.
// Это последняя линия обороны против катастрофы «тесты снесли прод».
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

export function assertLocalTestDatabase(url: string): void {
  const { host, database } = parseDatabaseUrl(url);
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `❌ Integration-тесты запрещены против нелокальной БД (host=${host}). ` +
        `Разрешён только loopback (localhost/127.0.0.1). Это защита от прогона по проду/удалённой БД.`,
    );
  }
  // Прод-БД называется ecoplatform_db (см. deploy/PRODUCTION.md) — явный запрет
  // на случай, если её когда-то поднимут локально в проброшенном порту.
  if (database === "ecoplatform_db") {
    throw new Error(`❌ Integration-тесты запрещены против БД '${database}' (имя прод-БД).`);
  }
}

export default async function setup() {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error("DATABASE_URL не задан — нечего использовать для тестовой БД");

  // Броня: не даём тестам даже начать против удалённой/прод-БД.
  assertLocalTestDatabase(baseUrl);

  const { host, port, user, password, database } = parseDatabaseUrl(baseUrl);
  const testDb = `${database}_test`;
  const testUrl = withDatabase(baseUrl, testDb);

  // 1. Создаём тестовую БД, если её ещё нет (через подключение к default db postgres).
  const adminUrl = withDatabase(baseUrl, "postgres");
  const adminClient = new Client({ connectionString: adminUrl });
  await adminClient.connect();
  const { rows } = await adminClient.query("SELECT 1 FROM pg_database WHERE datname = $1", [testDb]);
  if (rows.length === 0) {
    await adminClient.query(`CREATE DATABASE "${testDb}"`);
  }
  await adminClient.end();

  // 2. Накатываем миграции в тестовую БД.
  execSync("pnpm exec prisma migrate deploy", {
    cwd: resolve(__dirname, "../.."),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });

  // 3. Передаём тестовый DATABASE_URL во все воркеры через env.
  process.env.DATABASE_URL = testUrl;

  // 4. Отключаем фоновые cron-задачи на время тестов, чтобы они не дёргали
  //    реальную БД и не создавали лишних артефактов.
  process.env.SCHEDULER_DISABLED = "1";

  // Экспортируем для возможной teardown-логики (сейчас не используется).
  return async () => {
    /* no-op: оставляем БД для отладки между запусками */
  };
}
