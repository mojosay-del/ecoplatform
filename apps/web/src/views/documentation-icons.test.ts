import { describe, expect, it } from "vitest";
import { documentationDisplayIconNames } from "@ecoplatform/shared";
import {
  DOCUMENTATION_ICON_OPTIONS,
  documentationDisplayIconNameForNode,
  documentationDisplayIconOptionByName,
} from "./documentation-icons";

describe("documentation-icons", () => {
  it("показывает юридико-документальные варианты вместо сырьевых иконок", () => {
    const labels = DOCUMENTATION_ICON_OPTIONS.map((option) => option.label);

    expect(labels).toContain("Право / закон");
    expect(labels).toContain("Договоры");
    expect(labels).toContain("Регламенты");
    expect(labels).toContain("Общий раздел");
    expect(labels).not.toContain("ПЭТ-тара");
    expect(labels).not.toContain("Резина / шины");
    expect(labels).not.toContain("Смешанное сырьё");
  });

  it("имеет отображение для всех значений API", () => {
    for (const name of documentationDisplayIconNames) {
      expect(documentationDisplayIconOptionByName(name).label.length).toBeGreaterThan(0);
    }
  });

  it("подбирает иконку раздела по названию", () => {
    expect(documentationDisplayIconNameForNode({ title: "Договоры поставки" })).toBe("FileSignature");
    expect(documentationDisplayIconNameForNode({ title: "Законы и правовые нормы" })).toBe("Scale");
    expect(documentationDisplayIconNameForNode({ title: "Регламенты площадки" })).toBe("ClipboardCheck");
    expect(documentationDisplayIconNameForNode({ title: "Сертификаты и декларации" })).toBe("BadgeCheck");
    expect(documentationDisplayIconNameForNode({ title: "Архив документов" })).toBe("Archive");
  });

  it("оставляет явно сохранённое значение приоритетным", () => {
    expect(documentationDisplayIconNameForNode({ title: "Любой раздел", displayIcon: "Landmark" })).toBe("Landmark");
  });
});
