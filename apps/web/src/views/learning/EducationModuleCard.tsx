"use client";

// Карточка модуля на витрине «Обучение»: постер с обложкой, кинематографичным
// скримом, заголовком и мета-строкой на самой обложке. Клик ведёт на страницу
// курса /education/[moduleId] (модалки больше нет).

import Link from "next/link";
import { useState } from "react";
import type { LearningModuleListItem } from "@ecoplatform/shared";
import { CoverImage } from "../../components/CoverImage";
import { StatusPill } from "../../components/StatusPill";
import { pluralizeRu } from "../shared";
import { shouldRenderCoveredCardSkeleton } from "../shared/covered-card-readiness";
import { formatLearningDuration } from "./learning-format";

export function EducationModuleCard({ coverUrl, module }: { coverUrl: string | null; module: LearningModuleListItem }) {
  const [settledCoverUrl, setSettledCoverUrl] = useState<string | null>(null);
  const isInDevelopment = Boolean(module.isInDevelopment);
  const progressPercent = module.progress?.percent ?? 0;
  const isStarted = (module.progress?.completedLessons ?? 0) > 0;
  const showSkeleton = shouldRenderCoveredCardSkeleton({
    coverImageId: module.coverImageId,
    coverUrl,
    settledCoverUrl,
  });

  return (
    <article className={`education-card ${showSkeleton ? "is-awaiting-cover" : "is-cover-ready"}`}>
      <Link
        aria-hidden={showSkeleton || undefined}
        className="education-card-link"
        href={`/education/${module.id}`}
        inert={showSkeleton ? true : undefined}
      >
        <div className="education-card-cover">
          {coverUrl ? (
            <CoverImage
              alt=""
              src={coverUrl}
              onLoadSettled={() => setSettledCoverUrl(coverUrl)}
              sizes="(max-width: 880px) 100vw, (max-width: 1180px) 35vw, (max-width: 1500px) 25vw, 480px"
            />
          ) : module.coverImageId ? (
            <span className="cover-skeleton" aria-hidden="true" />
          ) : (
            <div className="education-card-cover-fallback" />
          )}
          <div className="education-card-scrim" aria-hidden="true" />
          <div className="education-card-poster">
            <h2 className="education-card-poster-title">{module.title}</h2>
            <p className="education-card-poster-meta">
              {module.totalLessons} {pluralizeRu(module.totalLessons, "урок", "урока", "уроков")}
              <span aria-hidden="true"> · </span>
              {formatLearningDuration(module.totalEstimatedMinutes)}
              {isStarted ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="education-card-poster-progress-note">пройдено {progressPercent}%</span>
                </>
              ) : null}
            </p>
          </div>
          {isStarted ? (
            <div
              aria-label={`Прогресс модуля: ${progressPercent}%`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={progressPercent}
              className="education-card-progress"
              role="progressbar"
            >
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          ) : null}
        </div>
        <StatusPill
          className="education-card-status"
          variant={isInDevelopment ? "warning" : module.hasAccess ? "success" : "brand"}
        >
          {isInDevelopment ? "В разработке" : module.hasAccess ? "Доступен" : "Нужна подписка"}
        </StatusPill>
        <div className="education-card-panel">
          <p>{module.summary}</p>
        </div>
        <span className="education-card-open-overlay" aria-hidden="true" />
      </Link>
      {showSkeleton ? <EducationModuleCardSkeleton overlay /> : null}
    </article>
  );
}

export function EducationModuleCardSkeleton({ overlay = false }: { overlay?: boolean }) {
  return (
    <div className={`education-card-skeleton${overlay ? " is-overlay" : ""}`} aria-hidden="true">
      <div className="education-card-cover">
        <span className="cover-skeleton" />
      </div>
      <div className="education-card-panel">
        <div className="page-skeleton-bar w-3-4" />
        <div className="page-skeleton-bar w-full" />
        <div className="page-skeleton-bar w-1-2" />
      </div>
    </div>
  );
}
