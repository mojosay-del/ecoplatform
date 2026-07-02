"use client";

// Кинематографичный hero страницы курса: тёмная тёплая зона с размытой
// обложкой-подложкой, крупной типографикой, мета-чипами и CTA. Ниже hero
// страница остаётся в светлом бренде.

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import type { LearningModuleDetail } from "@ecoplatform/shared";
import { CoverImage } from "../../components/CoverImage";
import { pluralizeRu } from "../shared";
import { formatLearningDuration } from "./learning-format";

const heroStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const heroItem = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const } },
};

export function ModuleHero({
  data,
  moduleId,
  coverUrl,
  hasAccess,
  isInDevelopment,
  preview,
}: {
  data: LearningModuleDetail;
  moduleId: string;
  coverUrl: string | null;
  hasAccess: boolean;
  isInDevelopment: boolean;
  preview: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const chapters = data.chapters ?? [];
  const chaptersCount = chapters.length;
  const lessonsCount = data.totalLessons ?? chapters.reduce((sum, chapter) => sum + (chapter.lessons?.length ?? 0), 0);
  const progress = data.progress;
  const isStarted = (progress?.completedLessons ?? 0) > 0;
  const previewSuffix = preview ? "?preview=1" : "";

  const firstLesson = chapters.flatMap((chapter) => chapter.lessons ?? [])[0] ?? null;
  const nextLesson = data.nextLessonId
    ? (chapters.flatMap((chapter) => chapter.lessons ?? []).find((lesson) => lesson.id === data.nextLessonId) ?? null)
    : null;

  const statusLabel = isInDevelopment ? "В разработке" : hasAccess ? "Доступен" : "Нужна подписка";
  const statusModifier = isInDevelopment ? " is-development" : hasAccess ? " is-open" : " is-locked";
  const accessLabel =
    data.accessLevel === "basic"
      ? "Базовая подписка"
      : data.accessLevel === "extended"
        ? "Расширенная подписка"
        : "Разовая покупка";

  const isCompleted = (progress?.percent ?? 0) >= 100 && (progress?.totalLessons ?? 0) > 0;
  let cta: { href: string; label: string } | null = null;
  if (hasAccess && isStarted && nextLesson) {
    cta = { href: `/education/${moduleId}/${nextLesson.id}${previewSuffix}`, label: `Продолжить: ${nextLesson.title}` };
  } else if (hasAccess && firstLesson) {
    cta = {
      href: `/education/${moduleId}/${firstLesson.id}${previewSuffix}`,
      label: isCompleted ? "Повторить курс" : "Начать обучение",
    };
  } else if (!hasAccess && !isInDevelopment) {
    cta = { href: "/account", label: "Активировать подписку" };
  }

  return (
    <motion.header
      animate="visible"
      className="module-hero-cinematic"
      initial={reducedMotion ? false : "hidden"}
      variants={heroStagger}
    >
      {coverUrl ? (
        <div aria-hidden="true" className="module-hero-backdrop">
          {/* Декоративная размытая подложка: CoverImage ради next/image-прокси,
              скелетон в этом контексте скрыт стилями. */}
          <CoverImage alt="" src={coverUrl} sizes="100vw" />
        </div>
      ) : null}
      <div className={`module-hero-inner${coverUrl ? "" : " no-cover"}`}>
        <div className="module-hero-content">
          <motion.span className={`module-hero-status${statusModifier}`} variants={heroItem}>
            {statusLabel}
            <span className="module-hero-status-sub">· {accessLabel}</span>
          </motion.span>
          <motion.h1 className="module-hero-title" variants={heroItem}>
            {data.title}
          </motion.h1>
          {data.summary ? (
            <motion.p className="module-hero-summary" variants={heroItem}>
              {data.summary}
            </motion.p>
          ) : null}
          {data.description ? (
            <motion.p className="module-hero-description" variants={heroItem}>
              {data.description}
            </motion.p>
          ) : null}
          <motion.ul className="module-hero-chips" variants={heroItem}>
            <li>
              {chaptersCount} {pluralizeRu(chaptersCount, "глава", "главы", "глав")}
            </li>
            <li>
              {lessonsCount} {pluralizeRu(lessonsCount, "урок", "урока", "уроков")}
            </li>
            <li>{formatLearningDuration(data.totalEstimatedMinutes ?? 0)}</li>
          </motion.ul>
          <motion.div className="module-hero-actions" variants={heroItem}>
            {cta ? (
              <Link className="button" href={cta.href}>
                {cta.label}
              </Link>
            ) : null}
            <Link className="button secondary module-hero-back" href="/education">
              ← К курсам
            </Link>
          </motion.div>
          {isStarted && progress ? (
            <motion.div className="module-hero-progress" variants={heroItem}>
              <div
                aria-label={`Прогресс модуля: ${progress.percent}%`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={progress.percent}
                className="module-hero-progress-bar"
                role="progressbar"
              >
                <motion.span
                  animate={{ width: `${progress.percent}%` }}
                  initial={reducedMotion ? false : { width: 0 }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.35 }}
                />
              </div>
              <p className="module-hero-progress-meta">
                Пройдено {progress.completedLessons} из {progress.totalLessons}{" "}
                {pluralizeRu(progress.totalLessons, "урока", "уроков", "уроков")} · {progress.percent}%
              </p>
            </motion.div>
          ) : null}
        </div>
        {coverUrl ? (
          <motion.div className="module-hero-art" variants={heroItem}>
            <CoverImage alt={data.title} src={coverUrl} sizes="(max-width: 1024px) 100vw, 460px" priority />
          </motion.div>
        ) : null}
      </div>
    </motion.header>
  );
}
