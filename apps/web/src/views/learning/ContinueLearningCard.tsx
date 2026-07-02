"use client";

// «Продолжить обучение» — широкая карточка над витриной для начатого модуля:
// тёмная кинематографичная зона с размытой обложкой, прогрессом и CTA прямо
// в следующий незавершённый урок.

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { LearningModuleListItem } from "@ecoplatform/shared";
import { pluralizeRu } from "../shared";

export function ContinueLearningCard({
  coverUrl,
  module,
}: {
  coverUrl: string | null;
  module: LearningModuleListItem;
}) {
  const reducedMotion = useReducedMotion();
  const progress = module.progress;
  if (!progress) return null;
  const continueHref = module.nextLessonId
    ? `/education/${module.id}/${module.nextLessonId}`
    : `/education/${module.id}`;

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      aria-label="Продолжить обучение"
      className="education-resume"
      initial={reducedMotion ? false : { opacity: 0, y: 14 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      {coverUrl ? (
        <div aria-hidden="true" className="education-resume-backdrop">
          {/* Обычный <img>: фон декоративный, скрыт скримом — CoverImage с
              скелетоном здесь не нужен. */}
          <img alt="" src={coverUrl} />
        </div>
      ) : null}
      <div className="education-resume-body">
        <p className="education-resume-eyebrow">Продолжить обучение</p>
        <h2 className="education-resume-title">{module.title}</h2>
        <div
          aria-label={`Прогресс модуля: ${progress.percent}%`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress.percent}
          className="education-resume-progress"
          role="progressbar"
        >
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <p className="education-resume-meta">
          Пройдено {progress.completedLessons} из {progress.totalLessons}{" "}
          {pluralizeRu(progress.totalLessons, "урока", "уроков", "уроков")} · {progress.percent}%
        </p>
      </div>
      <Link className="button education-resume-cta" href={continueHref}>
        Продолжить
      </Link>
    </motion.section>
  );
}
