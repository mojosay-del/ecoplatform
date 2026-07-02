import { describe, expect, it } from "vitest";
import { buildModuleProgressIndex } from "./learning-progress.helpers";

const modules = [
  {
    id: "m1",
    chapters: [{ lessons: [{ id: "l1" }, { id: "l2" }] }, { lessons: [{ id: "l3" }] }],
  },
  { id: "m2", chapters: [{ lessons: [] }] },
];

describe("buildModuleProgressIndex", () => {
  it("без прогресса: 0%, nextLessonId — первый урок", () => {
    const index = buildModuleProgressIndex(modules, []);

    expect(index.get("m1")).toEqual({
      progress: { completedLessons: 0, totalLessons: 3, percent: 0 },
      nextLessonId: "l1",
      lastActivityAt: null,
    });
    expect(index.get("m2")).toEqual({
      progress: { completedLessons: 0, totalLessons: 0, percent: 0 },
      nextLessonId: null,
      lastActivityAt: null,
    });
  });

  it("частичный прогресс: next — первый незавершённый, активность — максимум", () => {
    const early = new Date("2026-07-01T10:00:00Z");
    const late = new Date("2026-07-02T10:00:00Z");
    const index = buildModuleProgressIndex(modules, [
      { lessonId: "l1", completedAt: early },
      { lessonId: "l3", completedAt: late },
    ]);

    expect(index.get("m1")).toEqual({
      progress: { completedLessons: 2, totalLessons: 3, percent: 67 },
      nextLessonId: "l2",
      lastActivityAt: late,
    });
  });

  it("незавершённый урок в первой главе выбирается раньше уроков второй", () => {
    const index = buildModuleProgressIndex(modules, [{ lessonId: "l1", completedAt: new Date() }]);

    expect(index.get("m1")?.nextLessonId).toBe("l2");
  });

  it("полное прохождение: 100% и nextLessonId = null", () => {
    const done = new Date("2026-07-02T12:00:00Z");
    const index = buildModuleProgressIndex(modules, [
      { lessonId: "l1", completedAt: done },
      { lessonId: "l2", completedAt: done },
      { lessonId: "l3", completedAt: done },
    ]);

    expect(index.get("m1")).toEqual({
      progress: { completedLessons: 3, totalLessons: 3, percent: 100 },
      nextLessonId: null,
      lastActivityAt: done,
    });
  });
});
