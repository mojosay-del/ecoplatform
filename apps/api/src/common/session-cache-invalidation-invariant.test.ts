import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

// Инвариант M-1 (defense-in-depth для кэша сессии в JwtAuthGuard).
//
// На cache-hit guard возвращает кэшированного RequestUser без обращения к БД,
// т.е. без ре-проверки User.status / Company.status (TTL 60с). Чтобы блокировка
// применялась немедленно, КАЖДЫЙ путь, переводящий пользователя/компанию в
// ограничивающий доступ статус, обязан сбросить кэш сессии (invalidateUser /
// invalidateCompany / invalidateSession). Этот тест статически (через AST)
// гарантирует, что ни один такой путь не забыт — иначе заблокированный субъект
// сохранит доступ до истечения TTL.
//
// Проверяем только модели user/company (их статус читает guard). Безопасные
// целевые статусы (выдача/восстановление доступа, либо биллинговые состояния,
// гейтящиеся по ДАТАМ, а не по статусу) инвалидации не требуют.

const SESSION_MODELS = new Set(["user", "company"]);
const WRITE_METHODS = new Set(["update", "updateMany", "upsert"]);
const WRITE_DATA_KEYS = new Set(["data", "create", "update"]);
const INVALIDATE_METHODS = new Set(["invalidateUser", "invalidateCompany", "invalidateSession"]);

// Статусы, которые НЕ ограничивают доступ: их staleness лишь задерживает выдачу
// доступа (не угроза), а past_due/demo гейтятся по subscriptionEndsAt/demoEndsAt.
const SAFE_STATUS_VALUES = new Set(["active", "demo", "past_due"]);

// Осознанные исключения: ограничивающий/динамический статус-write без инвалидации
// — с обоснованием, почему это безопасно. Каждая запись проверяется на «живость»
// (если путь исчез — запись надо удалить).
const ALLOWLIST = new Map<string, string>([
  [
    "scheduler/scheduler-cleanup.helpers.ts",
    "Крон-восстановление компании из pending_deletion в прежний (не-blocked) статус: " +
      "это ВЫДАЧА доступа, а кэш для pending_deletion уже сброшен при входе в удаление.",
  ],
]);

interface StatusWriteMiss {
  file: string;
  line: number;
  model: string;
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const fullPath = join(dir, entry);
      if (statSync(fullPath).isDirectory()) {
        return listSourceFiles(fullPath);
      }
      if (fullPath.endsWith(".test.ts")) return [];
      return fullPath.endsWith(".service.ts") || fullPath.endsWith(".helpers.ts") ? [fullPath] : [];
    })
    .sort();
}

function propertyName(prop: ts.ObjectLiteralElementLike): string | null {
  if (
    (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) &&
    (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
  ) {
    return prop.name.text;
  }
  return null;
}

// Безопасен только явный безопасный литерал/enum (UserStatus.active, "demo", …).
// Динамическое значение или ограничивающий литерал считаем требующим инвалидации.
function statusValueIsSafe(expr: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(expr)) return SAFE_STATUS_VALUES.has(expr.name.text);
  if (ts.isStringLiteral(expr)) return SAFE_STATUS_VALUES.has(expr.text);
  return false;
}

function dataObjectHasUnsafeStatus(dataObject: ts.ObjectLiteralExpression): boolean {
  for (const prop of dataObject.properties) {
    if (propertyName(prop) !== "status") continue;
    if (ts.isPropertyAssignment(prop)) return !statusValueIsSafe(prop.initializer);
    // status-shorthand (переменная) — значение неизвестно → требуем инвалидацию.
    if (ts.isShorthandPropertyAssignment(prop)) return true;
  }
  return false;
}

// Это вызов вида X.<user|company>.<update|updateMany|upsert>(args) с присвоением
// ограничивающего/динамического статуса? Возвращает имя модели либо null.
function restrictiveStatusWriteModel(call: ts.CallExpression): string | null {
  if (!ts.isPropertyAccessExpression(call.expression)) return null;
  if (!WRITE_METHODS.has(call.expression.name.text)) return null;

  const modelAccess = call.expression.expression;
  if (!ts.isPropertyAccessExpression(modelAccess)) return null;
  const model = modelAccess.name.text;
  if (!SESSION_MODELS.has(model)) return null;

  const arg = call.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return null;

  const writesUnsafeStatus = arg.properties.some((prop) => {
    const name = propertyName(prop);
    return (
      name !== null &&
      WRITE_DATA_KEYS.has(name) &&
      ts.isPropertyAssignment(prop) &&
      ts.isObjectLiteralExpression(prop.initializer) &&
      dataObjectHasUnsafeStatus(prop.initializer)
    );
  });

  return writesUnsafeStatus ? model : null;
}

interface FileScan {
  statusWrites: StatusWriteMiss[];
  hasInvalidateCall: boolean;
}

function scanFile(filePath: string, apiSrcDir: string): FileScan {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statusWrites: StatusWriteMiss[] = [];
  let hasInvalidateCall = false;

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression) && INVALIDATE_METHODS.has(node.expression.name.text)) {
        hasInvalidateCall = true;
      }
      const model = restrictiveStatusWriteModel(node);
      if (model) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        statusWrites.push({ file: relative(apiSrcDir, filePath), line: position.line + 1, model });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { statusWrites, hasInvalidateCall };
}

describe("Session cache invalidation invariant", () => {
  const apiSrcDir = join(process.cwd(), "src");
  const scans = listSourceFiles(apiSrcDir).map((filePath) => ({
    filePath,
    rel: relative(apiSrcDir, filePath),
    ...scanFile(filePath, apiSrcDir),
  }));

  it("invalidates the session cache wherever User/Company status is restricted", () => {
    const checkedWrites = scans.reduce((total, scan) => total + scan.statusWrites.length, 0);
    expect(checkedWrites, "The invariant should detect at least one restrictive status write.").toBeGreaterThan(0);

    const misses = scans
      .filter((scan) => scan.statusWrites.length > 0 && !scan.hasInvalidateCall && !ALLOWLIST.has(scan.rel))
      .flatMap((scan) => scan.statusWrites);

    expect(
      misses.map((miss) => `${miss.file}:${miss.line} (${miss.model}.status)`),
      "Every write setting User/Company status to a restrictive/dynamic value must call " +
        "sessionCache.invalidate{User,Company,Session} in the same file (or be justified in ALLOWLIST).",
    ).toEqual([]);
  });

  it("keeps the ALLOWLIST free of stale entries", () => {
    const staleAllowlistFiles = [...ALLOWLIST.keys()].filter((rel) => {
      const scan = scans.find((entry) => entry.rel === rel);
      // Запись актуальна только если файл существует, реально пишет статус и не
      // инвалидирует кэш сам (иначе исключение больше не нужно).
      return !scan || scan.statusWrites.length === 0 || scan.hasInvalidateCall;
    });

    expect(
      staleAllowlistFiles,
      "Remove ALLOWLIST entries that no longer correspond to an un-invalidated status write.",
    ).toEqual([]);
  });
});
