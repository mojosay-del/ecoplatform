// Чистая логика витрины обучения: форматирование оценки длительности и выбор
// модуля для карточки «Продолжить обучение». Вынесено из вью для юнит-тестов.

import type { LearningModuleListItem } from "@ecoplatform/shared";

export function formatLearningDuration(minutes: number): string {
  if (minutes <= 0) {
    return "≈ 1 мин";
  }
  if (minutes < 60) {
    return `≈ ${minutes} мин`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `≈ ${hours} ч` : `≈ ${hours} ч ${rest} мин`;
}

// Кандидат для «Продолжить обучение»: начатый, но не завершённый модуль
// с самой свежей активностью. Ничего не начато или всё пройдено → null.
export function pickResumeModule(items: LearningModuleListItem[]): LearningModuleListItem | null {
  let candidate: LearningModuleListItem | null = null;
  for (const item of items) {
    if (!item.hasAccess || item.isInDevelopment) continue;
    const progress = item.progress;
    if (!progress || progress.completedLessons === 0 || progress.percent >= 100) continue;
    if (!candidate || (item.lastActivityAt ?? "") > (candidate.lastActivityAt ?? "")) {
      candidate = item;
    }
  }
  return candidate;
}
