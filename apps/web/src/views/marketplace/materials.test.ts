import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MATERIAL_COLORS, MATERIAL_LEGEND, materialColor } from "./materials";

describe("токены материалов", () => {
  it("отдаёт цвет категории и зелёный по умолчанию", () => {
    expect(materialColor("makulatura")).toBe("#8a5a2b");
    expect(materialColor("plenki")).toBe("#1f6fb8");
    expect(materialColor("plastiki")).toBe("#d9a300");
    expect(materialColor(undefined)).toBe("#1f8a4c");
    expect(materialColor("neizvestnaya-kategoriya")).toBe("#1f8a4c");
    // Ключи из прототипа объекта не должны считаться категориями.
    expect(materialColor("constructor")).toBe("#1f8a4c");
  });

  it("легенда покрывает все категории и совпадает по цветам", () => {
    expect(MATERIAL_LEGEND.map((item) => item.slug).sort()).toEqual(Object.keys(MATERIAL_COLORS).sort());
    for (const item of MATERIAL_LEGEND) {
      expect(item.color).toBe(materialColor(item.slug));
    }
  });

  // CSS-переменные --material-* в tokens.css — зеркало MATERIAL_COLORS для
  // чипов/легенды; рассинхрон ловим этим тестом, а не глазами в проде.
  it("совпадает с блоком --material-* в tokens.css", () => {
    const tokensCss = readFileSync(fileURLToPath(new URL("../../styles/tokens.css", import.meta.url)), "utf8");
    const fromCss: Record<string, string> = {};
    for (const [, name, hex] of tokensCss.matchAll(/--material-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
      if (name && hex) fromCss[name] = hex.toLowerCase();
    }
    expect(fromCss).toEqual(MATERIAL_COLORS);
  });
});
