import { describe, expect, it } from "vitest";
import type { LearningModuleListItem } from "@ecoplatform/shared";
import { formatLearningDuration, pickResumeModule } from "./learning-format";

function moduleItem(overrides: Partial<LearningModuleListItem>): LearningModuleListItem {
  return {
    id: "m",
    title: "Модуль",
    summary: null,
    description: null,
    coverImageId: null,
    accessLevel: "basic",
    oneTimePrice: null,
    isInDevelopment: false,
    position: 0,
    status: "published",
    hasAccess: true,
    chapters: [],
    totalLessons: 4,
    totalEstimatedMinutes: 30,
    progress: null,
    nextLessonId: null,
    lastActivityAt: null,
    ...overrides,
  };
}

describe("formatLearningDuration", () => {
  it("минуты до часа — «≈ N мин»", () => {
    expect(formatLearningDuration(25)).toBe("≈ 25 мин");
    expect(formatLearningDuration(59)).toBe("≈ 59 мин");
  });

  it("часы — «≈ N ч» и «≈ N ч M мин»", () => {
    expect(formatLearningDuration(60)).toBe("≈ 1 ч");
    expect(formatLearningDuration(80)).toBe("≈ 1 ч 20 мин");
    expect(formatLearningDuration(135)).toBe("≈ 2 ч 15 мин");
  });

  it("нулевые и отрицательные значения не ломают подпись", () => {
    expect(formatLearningDuration(0)).toBe("≈ 1 мин");
  });
});

describe("pickResumeModule", () => {
  it("возвращает null, когда ничего не начато", () => {
    expect(pickResumeModule([moduleItem({})])).toBeNull();
    expect(
      pickResumeModule([moduleItem({ progress: { completedLessons: 0, totalLessons: 4, percent: 0 } })]),
    ).toBeNull();
  });

  it("пропускает завершённые, недоступные и «в разработке» модули", () => {
    const finished = moduleItem({
      id: "done",
      progress: { completedLessons: 4, totalLessons: 4, percent: 100 },
      lastActivityAt: "2026-07-02T10:00:00.000Z",
    });
    const locked = moduleItem({
      id: "locked",
      hasAccess: false,
      progress: null,
    });
    const dev = moduleItem({
      id: "dev",
      isInDevelopment: true,
      progress: { completedLessons: 1, totalLessons: 4, percent: 25 },
    });

    expect(pickResumeModule([finished, locked, dev])).toBeNull();
  });

  it("из нескольких начатых выбирает модуль с самой свежей активностью", () => {
    const older = moduleItem({
      id: "older",
      progress: { completedLessons: 1, totalLessons: 4, percent: 25 },
      lastActivityAt: "2026-06-30T10:00:00.000Z",
    });
    const newer = moduleItem({
      id: "newer",
      progress: { completedLessons: 2, totalLessons: 4, percent: 50 },
      lastActivityAt: "2026-07-02T10:00:00.000Z",
    });

    expect(pickResumeModule([older, newer])?.id).toBe("newer");
    expect(pickResumeModule([newer, older])?.id).toBe("newer");
  });
});
