import { describe, expect, it } from "vitest";
import {
  bodyParagraphs,
  companyRoleLabel,
  forumStatusLabel,
  forumStatusVariant,
  initialsFromName,
} from "./forum-helpers";

describe("forum helpers", () => {
  it("maps statuses to RU labels (solved → Решено, остальное → Нужен ответ)", () => {
    expect(forumStatusLabel("solved")).toBe("Решено");
    expect(forumStatusLabel("open")).toBe("Нужен ответ");
    expect(forumStatusLabel("answered")).toBe("Нужен ответ");
    expect(forumStatusLabel("hidden")).toBe("Скрыто");
  });

  it("maps statuses to card variants", () => {
    expect(forumStatusVariant("solved")).toBe("solved");
    expect(forumStatusVariant("answered")).toBe("open");
    expect(forumStatusVariant("hidden")).toBe("hidden");
  });

  it("labels company type as forum author role", () => {
    expect(companyRoleLabel("collector")).toBe("Заготовитель");
    expect(companyRoleLabel("trader")).toBe("Трейдер");
    expect(companyRoleLabel("processor")).toBe("Переработчик");
    expect(companyRoleLabel(null)).toBeNull();
  });

  it("builds avatar initials from display name", () => {
    expect(initialsFromName("Игорь П.")).toBe("ИП");
    expect(initialsFromName("Анна")).toBe("А");
    expect(initialsFromName("")).toBe("?");
  });

  it("splits plain-text body into paragraphs, dropping blank lines", () => {
    expect(bodyParagraphs("Первый абзац\n\nВторой абзац\n")).toEqual(["Первый абзац", "Второй абзац"]);
    expect(bodyParagraphs("   ")).toEqual([]);
  });
});
