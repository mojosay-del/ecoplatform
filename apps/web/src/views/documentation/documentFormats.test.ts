import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FORMAT_COLORS, FORMAT_LEGEND, formatColor, formatFamily, formatLabel } from "./documentFormats";

describe("токены форматов документов", () => {
  it("сопоставляет расширение с семьёй формата и её цветом", () => {
    expect(formatColor("pdf")).toBe(FORMAT_COLORS.pdf);
    expect(formatColor("docx")).toBe(FORMAT_COLORS.doc);
    expect(formatColor("XLSX")).toBe(FORMAT_COLORS.sheet);
    expect(formatColor("pptx")).toBe(FORMAT_COLORS.slide);
    expect(formatColor("zip")).toBe(FORMAT_COLORS.archive);
    expect(formatColor("неизвестно")).toBe(FORMAT_COLORS.default);
    expect(formatColor(undefined)).toBe(FORMAT_COLORS.default);
    // Ключи из прототипа объекта не должны считаться форматами.
    expect(formatFamily("constructor")).toBe("default");
  });

  it("формирует ярлык формата", () => {
    expect(formatLabel("docx")).toBe("DOCX");
    expect(formatLabel("file")).toBe("ФАЙЛ");
    expect(formatLabel(undefined)).toBe("ФАЙЛ");
  });

  it("легенда покрывает все семьи и совпадает по цветам", () => {
    expect(FORMAT_LEGEND.map((item) => item.family).sort()).toEqual(Object.keys(FORMAT_COLORS).sort());
    for (const item of FORMAT_LEGEND) {
      expect(item.color).toBe(FORMAT_COLORS[item.family]);
    }
  });

  // CSS-переменные --format-* в tokens.css — зеркало FORMAT_COLORS для бейджей и
  // чипов; рассинхрон ловим этим тестом, а не глазами в проде.
  it("совпадает с блоком --format-* в tokens.css", () => {
    const tokensCss = readFileSync(fileURLToPath(new URL("../../styles/tokens.css", import.meta.url)), "utf8");
    const fromCss: Record<string, string> = {};
    for (const [, name, hex] of tokensCss.matchAll(/--format-([a-z]+):\s*(#[0-9a-fA-F]{6})/g)) {
      if (name && hex) fromCss[name] = hex.toLowerCase();
    }
    expect(fromCss).toEqual(FORMAT_COLORS);
  });
});
