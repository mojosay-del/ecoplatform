"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { LearningChapterSummary, LearningModuleListItem, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { CoverImage } from "../../components/CoverImage";
import { StatusPill } from "../../components/StatusPill";
import { api, preferredFileAssetImageUrl } from "../../lib/api";
import { useCoverAssets } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, pluralizeRu, useApiQuery } from "../shared";
import { shouldRenderCoveredCardSkeleton } from "../shared/covered-card-readiness";

export function EducationView() {
  const {
    data: page,
    state,
    errorMessage,
  } = useApiQuery("learning-modules", () => api.learning.listModules({ limit: 100 }), {
    items: [],
    total: 0,
    hasMore: false,
  } as PaginatedResponse<LearningModuleListItem>);
  const data = page.items;
  const covers = useCoverAssets(data);
  const lessonsCount = useMemo(
    () =>
      data.reduce(
        (sum, module) =>
          sum +
          (module.chapters?.reduce(
            (chapterSum: number, chapter: LearningChapterSummary) => chapterSum + (chapter.lessons?.length ?? 0),
            0,
          ) ?? 0),
        0,
      ),
    [data],
  );
  const lessonsLabel = `${lessonsCount} ${pluralizeRu(
    lessonsCount,
    "урок добавлен",
    "урока добавлено",
    "уроков добавлено",
  )}`;

  if (state === "unauthenticated") {
    return <AuthRequired title="Обучение" />;
  }

  if (state === "forbidden") {
    return <AccessClosed title="Обучение" />;
  }

  if (state === "error") {
    return <ErrorState title="Обучение" message={errorMessage} />;
  }

  return (
    <AppShell>
      <section className="page">
        <header className="education-header">
          <h1 className="education-title">Обучение</h1>
          <p className="education-subtitle">Практические материалы для закупки, склада и работы с качеством сырья.</p>
          <p className="education-header-metric">{lessonsLabel}</p>
        </header>
        {state === "loading" ? (
          <div className="education-grid" aria-busy="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <article className="education-card" key={index} aria-hidden="true">
                <EducationModuleCardSkeleton />
              </article>
            ))}
          </div>
        ) : (
          <div className="education-grid">
            {data.map((module) => (
              <EducationModuleCard
                coverUrl={preferredFileAssetImageUrl(module.coverImageId ? covers.get(module.coverImageId) : null)}
                key={module.id}
                module={module}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function EducationModuleCard({ coverUrl, module }: { coverUrl: string | null; module: LearningModuleListItem }) {
  const [settledCoverUrl, setSettledCoverUrl] = useState<string | null>(null);
  const lessonsCount =
    module.chapters?.reduce(
      (sum: number, chapter: LearningChapterSummary) => sum + (chapter.lessons?.length ?? 0),
      0,
    ) ?? 0;
  const isInDevelopment = Boolean(module.isInDevelopment);
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
          <div className="education-card-cover-meta">
            <h2 className="education-card-title-badge">{module.title}</h2>
            <span className="education-card-lessons-badge">Уроков: {lessonsCount}</span>
          </div>
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

function EducationModuleCardSkeleton({ overlay = false }: { overlay?: boolean }) {
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
