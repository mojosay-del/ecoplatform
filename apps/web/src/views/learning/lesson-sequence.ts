// Сквозная последовательность уроков модуля (по порядку глав) и навигация
// от текущего урока: prev/next, позиция «Урок X из Y», подпись кнопки
// «Следующий …». Вынесено из LessonView для переиспользования в оглавлении
// сайдбара и юнит-тестов.

import type { LearningChapterDetail, LessonDetail } from "@ecoplatform/shared";

export type LessonSequenceEntry = {
  chapter: LearningChapterDetail;
  chapterIndex: number;
  lesson: LessonDetail;
  lessonIndex: number;
};

export type LessonNavigation = {
  current: LessonSequenceEntry | null;
  previous: LessonSequenceEntry | null;
  next: LessonSequenceEntry | null;
  // 1-based позиция текущего урока в модуле; 0, если урок не найден.
  position: number;
  total: number;
  // Подпись кнопки «дальше»: смена главы называется явно.
  nextLabel: string | null;
};

export function buildLessonSequence(chapters: LearningChapterDetail[]): LessonSequenceEntry[] {
  return chapters.flatMap((chapter, chapterIndex) =>
    (chapter.lessons ?? []).map((lesson, lessonIndex) => ({ chapter, chapterIndex, lesson, lessonIndex })),
  );
}

export function lessonNavigation(chapters: LearningChapterDetail[], lessonId: string): LessonNavigation {
  const sequence = buildLessonSequence(chapters);
  const index = sequence.findIndex((entry) => entry.lesson.id === lessonId);
  const current = index >= 0 ? sequence[index] : null;
  const previous = index > 0 ? (sequence[index - 1] ?? null) : null;
  const next = index >= 0 ? (sequence[index + 1] ?? null) : null;
  const nextLabel = next
    ? next.chapter.id !== current?.chapter.id
      ? `Следующая глава: урок ${next.lessonIndex + 1}`
      : "Следующий урок"
    : null;

  return {
    current: current ?? null,
    previous,
    next,
    position: index >= 0 ? index + 1 : 0,
    total: sequence.length,
    nextLabel,
  };
}
