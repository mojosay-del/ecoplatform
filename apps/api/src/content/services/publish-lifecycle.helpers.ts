import { ContentStatus } from "@prisma/client";

// L-8: единый «жизненный цикл публикации» для всех контент-доменов (новости,
// база знаний, документация, индексы, обучение). Первая публикация фиксирует
// `firstPublishedAt`; повторная — сохраняет исходную дату. Поведение идентично
// прежнему inline-коду `firstPublishedAt: existing.firstPublishedAt ?? now`,
// просто перестало дублироваться по ~6 местам.
export function publishedLifecycleData(
  current: { firstPublishedAt: Date | null },
  now: Date = new Date(),
): { status: ContentStatus; firstPublishedAt: Date } {
  return {
    status: ContentStatus.published,
    firstPublishedAt: current.firstPublishedAt ?? now,
  };
}
