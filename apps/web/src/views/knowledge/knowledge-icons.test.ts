import { describe, expect, it } from "vitest";
import { knowledgeBaseDisplayIconNames } from "@ecoplatform/shared";
import {
  KNOWLEDGE_ICON_OPTIONS,
  knowledgeDisplayIconNameForNode,
  knowledgeDisplayIconOptionByName,
} from "./knowledge-icons";

describe("knowledge-base-icons", () => {
  it("показывает в пикере сырьевые варианты вместо служебных иконок", () => {
    const labels = KNOWLEDGE_ICON_OPTIONS.map((option) => option.label);

    expect(labels).toContain("ПЭТ-тара");
    expect(labels).toContain("Резина / шины");
    expect(labels).toContain("Электроника");
    expect(labels).toContain("Смешанное сырьё");
    expect(labels).not.toContain("Документ");
    expect(labels).not.toContain("Производство");
    expect(labels).not.toContain("Нейтральная");
  });

  it("имеет отображение для всех старых и новых значений API", () => {
    for (const name of knowledgeBaseDisplayIconNames) {
      expect(knowledgeDisplayIconOptionByName(name).label.length).toBeGreaterThan(0);
    }

    expect(knowledgeDisplayIconOptionByName("CircleDot").label).toBe("Смешанное сырьё");
    expect(knowledgeDisplayIconOptionByName("Archive").label).toBe("Архивная макулатура");
  });

  it("подбирает сырьевую иконку по названию номенклатуры", () => {
    expect(knowledgeDisplayIconNameForNode({ title: "Архив" }, 1)).toBe("Newspaper");
    expect(knowledgeDisplayIconNameForNode({ title: "ПЭТ-бутылки" }, 1)).toBe("CupSoda");
    expect(knowledgeDisplayIconNameForNode({ title: "Резина и шины" }, 1)).toBe("Disc3");
    expect(knowledgeDisplayIconNameForNode({ title: "Электроника" }, 1)).toBe("CircuitBoard");
  });

  it("оставляет явно сохранённые legacy-значения валидными", () => {
    expect(knowledgeDisplayIconNameForNode({ title: "Любой материал", displayIcon: "Archive" }, 1)).toBe("Archive");
  });
});
