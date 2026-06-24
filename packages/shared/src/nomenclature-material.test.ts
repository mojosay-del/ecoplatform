import { describe, expect, it } from "vitest";
import { materialFromNomenclatureCode } from "./nomenclature-material";

describe("materialFromNomenclatureCode", () => {
  it("относит МКЛ/МКР/МС к макулатуре (включая марки стандарта по ГОСТ)", () => {
    expect(materialFromNomenclatureCode("МКЛ-001").slug).toBe("makulatura");
    expect(materialFromNomenclatureCode("МКР-КРТ-001").slug).toBe("makulatura");
    // Реальные марки макулатуры по ГОСТ (МС-5Б … МС-13В) — тоже макулатура.
    expect(materialFromNomenclatureCode("МС5-Б").slug).toBe("makulatura");
    expect(materialFromNomenclatureCode("МС-13В").slug).toBe("makulatura");
  });

  it("различает плёнки и пластики по префиксу", () => {
    expect(materialFromNomenclatureCode("ПЛН-001").slug).toBe("plenki");
    expect(materialFromNomenclatureCode("ПЛС-001").slug).toBe("plastiki");
  });

  it("регистр и пробелы не важны", () => {
    expect(materialFromNomenclatureCode("  мкл-009 ").slug).toBe("makulatura");
  });

  it("неизвестный/пустой код → прочее (default)", () => {
    expect(materialFromNomenclatureCode("XYZ-1").slug).toBe("default");
    expect(materialFromNomenclatureCode(null).slug).toBe("default");
    expect(materialFromNomenclatureCode(undefined).slug).toBe("default");
  });
});
