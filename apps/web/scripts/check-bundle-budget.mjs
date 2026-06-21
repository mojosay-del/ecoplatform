// Бюджет клиентского бандла (M-7). Считает два числа, которые реально гейтят
// производительность, и сверяет с bundle-budget.json:
//   • SHARED first-load — пол, который платит КАЖДЫЙ маршрут (rootMainFiles +
//     polyfills app-роутера). Регрессия здесь (напр., тяжёлый виджет затащили в
//     общий чанк вместо next/dynamic) бьёт по всем страницам сразу.
//   • TOTAL client JS — сумма всех static/chunks/*.js (грубый потолок на всё
//     приложение, ловит общий разрастающийся вес).
//
// Next 16 больше НЕ печатает таблицу First Load JS в выводе сборки, а
// app-build-manifest.json не всегда генерируется, поэтому считаем из
// build-manifest.json + файлов на диске (устойчиво к версии Next).
//
// Запуск: сначала собрать (`next build`), затем `node scripts/check-bundle-budget.mjs`.
// Детальный per-chunk разбор — в .next/analyze/*.html (`pnpm analyze`).

import { gzipSync } from "node:zlib";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = join(webRoot, ".next");

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(join(nextDir, "build-manifest.json"), "utf8"));
} catch {
  fail("Нет .next/build-manifest.json — сначала соберите веб (`pnpm --filter @ecoplatform/web build`).");
}

const budget = JSON.parse(readFileSync(join(webRoot, "bundle-budget.json"), "utf8"));

const gzipKb = (relPath) => gzipSync(readFileSync(join(nextDir, relPath))).length / 1024;

const sharedFiles = [...manifest.rootMainFiles, ...manifest.polyfillFiles];
const sharedGzipKb = sharedFiles.reduce((sum, file) => sum + gzipKb(file), 0);

function collectJs(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJs(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const allChunks = collectJs(join(nextDir, "static", "chunks"));
const totalGzipKb = allChunks.reduce((sum, file) => sum + gzipSync(readFileSync(file)).length / 1024, 0);

const checks = [
  { label: "SHARED first-load JS (gzip)", actual: sharedGzipKb, budget: budget.sharedFirstLoadGzipKb },
  { label: "TOTAL client JS (gzip)", actual: totalGzipKb, budget: budget.totalClientGzipKb },
];

let failed = false;
console.log("Bundle budget (gzip kB):");
for (const { label, actual, budget: limit } of checks) {
  const over = actual > limit;
  failed = failed || over;
  const mark = over ? "✗" : "✓";
  console.log(`  ${mark} ${label}: ${actual.toFixed(1)} / ${limit} (${((actual / limit) * 100).toFixed(0)}%)`);
}

if (failed) {
  fail(
    "Превышен бюджет бандла. Либо найдите регрессию (тяжёлый импорт в общий чанк? потерянный next/dynamic?), " +
      "либо, если рост осознанный, поднимите лимит в apps/web/bundle-budget.json.",
  );
}

console.log("\n✓ Бюджет бандла соблюдён.");
