import { describe, expect, it } from "vitest";
import type { LearningChapterDetail } from "@ecoplatform/shared";
import { buildLessonSequence, lessonNavigation } from "./lesson-sequence";

function lesson(id: string) {
  return { id, title: id, coverImageId: null, coverSubtitle: null, position: 0, status: "published" };
}

const chapters: LearningChapterDetail[] = [
  { id: "c1", title: "Глава 1", position: 0, lessons: [lesson("l1"), lesson("l2")] },
  { id: "c2", title: "Глава 2", position: 1, lessons: [lesson("l3")] },
  { id: "c3", title: "Пустая", position: 2, lessons: [] },
];

describe("buildLessonSequence", () => {
  it("флаттенит уроки в порядке глав и пропускает пустые главы", () => {
    const sequence = buildLessonSequence(chapters);

    expect(sequence.map((entry) => entry.lesson.id)).toEqual(["l1", "l2", "l3"]);
    expect(sequence[2]).toMatchObject({ chapterIndex: 1, lessonIndex: 0 });
  });
});

describe("lessonNavigation", () => {
  it("первый урок: нет previous, next в той же главе", () => {
    const nav = lessonNavigation(chapters, "l1");

    expect(nav.previous).toBeNull();
    expect(nav.next?.lesson.id).toBe("l2");
    expect(nav.nextLabel).toBe("Следующий урок");
    expect(nav.position).toBe(1);
    expect(nav.total).toBe(3);
  });

  it("переход через границу главы подписывается «Следующая глава»", () => {
    const nav = lessonNavigation(chapters, "l2");

    expect(nav.next?.lesson.id).toBe("l3");
    expect(nav.nextLabel).toBe("Следующая глава: урок 1");
  });

  it("последний урок: нет next и подписи", () => {
    const nav = lessonNavigation(chapters, "l3");

    expect(nav.previous?.lesson.id).toBe("l2");
    expect(nav.next).toBeNull();
    expect(nav.nextLabel).toBeNull();
  });

  it("неизвестный урок: пустая навигация", () => {
    const nav = lessonNavigation(chapters, "нет");

    expect(nav.current).toBeNull();
    expect(nav.previous).toBeNull();
    expect(nav.next).toBeNull();
    expect(nav.position).toBe(0);
  });
});
