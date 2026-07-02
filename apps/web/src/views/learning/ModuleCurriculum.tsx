"use client";

// Программа курса: открытый таймлайн глав (без аккордеона — короткие
// программы лучше сканируются целиком). Каждая строка урока показывает
// номер, название, «≈ N мин» и состояние: пройден / доступен / закрыт.
// Заблокированным программа видна (названия уроков и так в контракте API),
// но строки не кликаются — вместо стрелки замок.

import Link from "next/link";
import { ArrowRight, Check, Lock } from "lucide-react";
import type { LearningChapterDetail, LessonDetail } from "@ecoplatform/shared";
import { RevealBlock } from "../content-blocks/RevealBlock";
import { pluralizeRu } from "../shared";
import { formatLearningDuration } from "./learning-format";

export function ModuleCurriculum({
  chapters,
  moduleId,
  hasAccess,
  preview,
}: {
  chapters: LearningChapterDetail[];
  moduleId: string;
  hasAccess: boolean;
  preview: boolean;
}) {
  const previewSuffix = preview ? "?preview=1" : "";

  return (
    <section className="module-chapters">
      <h2 className="module-chapters-title">Программа курса</h2>
      <div className="chapters-list">
        {chapters.map((chapter, chapterIndex) => {
          const lessons = chapter.lessons ?? [];
          const chapterMinutes = lessons.reduce((sum, lesson) => sum + (lesson.estimatedMinutes ?? 0), 0);
          return (
            <RevealBlock key={chapter.id}>
              <article className="chapter-card">
                <header className="chapter-card-header">
                  <span className="chapter-number">{String(chapterIndex + 1).padStart(2, "0")}</span>
                  <div className="chapter-card-info">
                    <h3 className="chapter-card-title">{chapter.title}</h3>
                    <p className="chapter-card-meta">
                      {lessons.length} {pluralizeRu(lessons.length, "урок", "урока", "уроков")}
                      {chapterMinutes > 0 ? ` · ${formatLearningDuration(chapterMinutes)}` : null}
                    </p>
                  </div>
                </header>
                {lessons.length === 0 ? (
                  <p className="chapter-card-empty">В этой главе пока пусто.</p>
                ) : (
                  <ol className="lesson-list">
                    {lessons.map((lesson, lessonIndex) => (
                      <li className="lesson-item" key={lesson.id}>
                        <CurriculumRow
                          hasAccess={hasAccess}
                          href={`/education/${moduleId}/${lesson.id}${previewSuffix}`}
                          index={`${chapterIndex + 1}.${lessonIndex + 1}`}
                          lesson={lesson}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            </RevealBlock>
          );
        })}
      </div>
    </section>
  );
}

function CurriculumRow({
  hasAccess,
  href,
  index,
  lesson,
}: {
  hasAccess: boolean;
  href: string;
  index: string;
  lesson: LessonDetail;
}) {
  const isCompleted = Boolean(lesson.completedAt);
  const minutes = lesson.estimatedMinutes ?? 0;
  const body = (
    <>
      <span className="lesson-item-index">{index}</span>
      <span className="lesson-item-title">{lesson.title}</span>
      <span className="lesson-item-duration">{minutes > 0 ? formatLearningDuration(minutes) : null}</span>
      <span aria-hidden="true" className={`lesson-item-state${isCompleted ? " is-completed" : ""}`}>
        {!hasAccess ? <Lock size={15} /> : isCompleted ? <Check size={15} /> : <ArrowRight size={15} />}
      </span>
    </>
  );

  if (!hasAccess) {
    return <div className="lesson-item-link is-locked">{body}</div>;
  }

  return (
    <Link className={`lesson-item-link${isCompleted ? " is-completed" : ""}`} href={href}>
      {isCompleted ? <span className="learning-sr-only">Пройден: </span> : null}
      {body}
    </Link>
  );
}
