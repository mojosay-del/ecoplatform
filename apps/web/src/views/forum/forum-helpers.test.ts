import { describe, expect, it } from "vitest";
import {
  bodyParagraphs,
  companyRoleLabel,
  forumProfileRoleLabel,
  forumStatusLabel,
  forumStatusVariant,
  initialsFromName,
  visibleForumMarketplaceReputation,
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

  it("shows platform badge for staff before company or verified labels", () => {
    expect(
      forumProfileRoleLabel({
        companyType: "collector",
        isPlatformStaff: true,
        verified: true,
      }),
    ).toBe("ЭкоПлатформа");
    expect(
      forumProfileRoleLabel({
        companyType: "trader",
        platformRoles: ["moderator"],
        verified: true,
      }),
    ).toBe("ЭкоПлатформа");
  });

  it("keeps company and verified labels for regular users", () => {
    expect(forumProfileRoleLabel({ companyType: "collector", verified: false })).toBe("Заготовитель");
    expect(forumProfileRoleLabel({ companyType: null, verified: true })).toBe("Проверенный профиль");
    expect(forumProfileRoleLabel({ companyType: null, verified: false })).toBeNull();
  });

  it("hides marketplace rating and deals while the marketplace is disabled", () => {
    expect(visibleForumMarketplaceReputation({ rating: 4.8, dealsCompleted: 12 }, false)).toEqual({
      rating: null,
      dealsCompleted: 0,
    });
    expect(visibleForumMarketplaceReputation({ rating: 4.8, dealsCompleted: 12 }, undefined)).toEqual({
      rating: null,
      dealsCompleted: 0,
    });
  });

  it("keeps marketplace rating and deals while the marketplace is enabled", () => {
    expect(visibleForumMarketplaceReputation({ rating: 4.8, dealsCompleted: 12 }, true)).toEqual({
      rating: 4.8,
      dealsCompleted: 12,
    });
    expect(visibleForumMarketplaceReputation({ rating: null, dealsCompleted: 0 }, true)).toEqual({
      rating: null,
      dealsCompleted: 0,
    });
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
