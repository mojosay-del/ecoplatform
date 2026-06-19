import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const MUTATING_DECORATORS = new Set(["Delete", "Patch", "Post", "Put"]);
const BODY_DECORATORS = new Set(["Body"]);

interface ValidationMiss {
  file: string;
  line: number;
  method: string;
}

interface ValidationReport {
  checkedBodyMethods: number;
  misses: ValidationMiss[];
}

function listControllerFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        return listControllerFiles(fullPath);
      }

      return fullPath.endsWith(".controller.ts") ? [fullPath] : [];
    })
    .sort();
}

function decoratorName(decorator: ts.Decorator): string | null {
  const expression = decorator.expression;
  const callee = ts.isCallExpression(expression) ? expression.expression : expression;

  if (ts.isIdentifier(callee)) {
    return callee.text;
  }

  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }

  return null;
}

function hasDecorator(node: ts.Node, names: Set<string>): boolean {
  const decorators = ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
  return decorators.some((decorator) => {
    const name = decoratorName(decorator);
    return name !== null && names.has(name);
  });
}

function methodName(node: ts.MethodDeclaration): string {
  if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name)) {
    return node.name.text;
  }

  return node.name.getText();
}

function containsParseBodyCall(node: ts.Node): boolean {
  let found = false;

  function visit(current: ts.Node): void {
    if (found) {
      return;
    }

    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === "parseBody"
    ) {
      found = true;
      return;
    }

    ts.forEachChild(current, visit);
  }

  visit(node);
  return found;
}

function findValidationMisses(filePath: string, apiSrcDir: string): ValidationReport {
  const sourceText = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let checkedBodyMethods = 0;
  const misses: ValidationMiss[] = [];

  function visit(node: ts.Node): void {
    if (ts.isMethodDeclaration(node) && hasDecorator(node, MUTATING_DECORATORS)) {
      const hasBodyParameter = node.parameters.some((parameter) => hasDecorator(parameter, BODY_DECORATORS));

      if (hasBodyParameter) {
        checkedBodyMethods += 1;
      }

      if (hasBodyParameter && (!node.body || !containsParseBodyCall(node.body))) {
        const position = sourceFile.getLineAndCharacterOfPosition(node.name.getStart(sourceFile));
        misses.push({
          file: relative(apiSrcDir, filePath),
          line: position.line + 1,
          method: methodName(node),
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { checkedBodyMethods, misses };
}

describe("API body validation invariant", () => {
  it("validates every mutating @Body() payload through parseBody", () => {
    const apiSrcDir = join(process.cwd(), "src");
    const reports = listControllerFiles(apiSrcDir).map((filePath) => findValidationMisses(filePath, apiSrcDir));
    const checkedBodyMethods = reports.reduce((total, report) => total + report.checkedBodyMethods, 0);
    const misses = reports.flatMap((report) => report.misses);

    expect(
      checkedBodyMethods,
      "The invariant should inspect at least one mutating controller @Body().",
    ).toBeGreaterThan(0);

    expect(
      misses.map((miss) => `${miss.file}:${miss.line} ${miss.method}()`),
      "Every @Body() in POST/PUT/PATCH/DELETE controllers must call parseBody(zodSchema, body).",
    ).toEqual([]);
  });
});
