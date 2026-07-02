// Прогресс пользователя по модулям для списка витрины: одна grouped-выборка
// LessonProgress → индекс по модулям без N+1. Порядок уроков берём из уже
// загруженных глав (position asc), поэтому nextLessonId — первый
// незавершённый урок в сквозном порядке программы.

export type ModuleWithOrderedLessons = {
  id: string;
  chapters: Array<{ lessons: Array<{ id: string }> }>;
};

export type LessonProgressRow = { lessonId: string; completedAt: Date };

export type ModuleProgressInfo = {
  progress: { completedLessons: number; totalLessons: number; percent: number };
  nextLessonId: string | null;
  lastActivityAt: Date | null;
};

export function buildModuleProgressIndex(
  modules: ModuleWithOrderedLessons[],
  progressRows: LessonProgressRow[],
): Map<string, ModuleProgressInfo> {
  const completedByLessonId = new Map(progressRows.map((row) => [row.lessonId, row.completedAt]));
  const index = new Map<string, ModuleProgressInfo>();

  for (const module of modules) {
    let completedLessons = 0;
    let totalLessons = 0;
    let nextLessonId: string | null = null;
    let lastActivityAt: Date | null = null;

    for (const chapter of module.chapters) {
      for (const lesson of chapter.lessons) {
        totalLessons += 1;
        const completedAt = completedByLessonId.get(lesson.id);
        if (completedAt) {
          completedLessons += 1;
          if (!lastActivityAt || completedAt > lastActivityAt) {
            lastActivityAt = completedAt;
          }
        } else if (!nextLessonId) {
          nextLessonId = lesson.id;
        }
      }
    }

    index.set(module.id, {
      progress: {
        completedLessons,
        totalLessons,
        percent: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
      },
      nextLessonId,
      lastActivityAt,
    });
  }

  return index;
}
