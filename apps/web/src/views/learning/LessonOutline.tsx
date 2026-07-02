"use client";

// «Содержание модуля» в сайдбаре урока: все уроки по главам, пройденные с
// галочкой, текущий подсвечен. Даёт свободную навигацию по модулю, не уходя
// на страницу курса.

import Link from "next/link";
import { Check } from "lucide-react";
import type { LearningChapterDetail } from "@ecoplatform/shared";
import { buildLessonSequence } from "./lesson-sequence";

export function LessonOutline({
  chapters,
  moduleId,
  currentLessonId,
  completedLessonIds,
  previewSuffix,
}: {
  chapters: LearningChapterDetail[];
  moduleId: string;
  currentLessonId: string;
  completedLessonIds: ReadonlySet<string>;
  previewSuffix: string;
}) {
  const sequence = buildLessonSequence(chapters);
  if (sequence.length === 0) return null;

  return (
    <div className="lesson-side-card">
      <div className="lesson-side-card-header">Содержание модуля</div>
      <ol className="lesson-outline">
        {sequence.map((entry) => {
          const isCurrent = entry.lesson.id === currentLessonId;
          const isCompleted = completedLessonIds.has(entry.lesson.id);
          const showChapterLabel = entry.lessonIndex === 0 && chapters.length > 1;
          return (
            <li key={entry.lesson.id}>
              {showChapterLabel ? <p className="lesson-outline-chapter">{entry.chapter.title}</p> : null}
              <Link
                aria-current={isCurrent ? "page" : undefined}
                className={`lesson-outline-item${isCurrent ? " is-current" : ""}${isCompleted ? " is-completed" : ""}`}
                href={`/education/${moduleId}/${entry.lesson.id}${previewSuffix}`}
              >
                <span aria-hidden="true" className="lesson-outline-marker">
                  {isCompleted ? <Check size={12} /> : `${entry.chapterIndex + 1}.${entry.lessonIndex + 1}`}
                </span>
                <span className="lesson-outline-title">
                  {isCompleted ? <span className="learning-sr-only">Пройден: </span> : null}
                  {entry.lesson.title}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
