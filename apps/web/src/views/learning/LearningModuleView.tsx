"use client";

import Link from "next/link";
import Image from "next/image";
import { GraduationCap } from "lucide-react";
import type { LearningChapterDetail, LearningModuleDetail } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { StatusPill } from "../../components/StatusPill";
import { api, preferredFileAssetImageUrl } from "../../lib/api";
import { useCoverAssets } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, pluralizeRu, useApiQuery } from "../shared";

export function LearningModuleView({ moduleId, preview = false }: { moduleId: string; preview?: boolean }) {
  const { data, state, errorMessage } = useApiQuery<LearningModuleDetail | null>(
    `learning-module:${moduleId}:${preview ? "preview" : "public"}`,
    () => api.learning.getModule(moduleId, { preview }),
    null,
  );
  // Используем тот же хук, что и каталог модулей, чтобы подтянуть URL обложки.
  const covers = useCoverAssets(data ? [data] : []);

  if (state === "unauthenticated") {
    return <AuthRequired title="Обучение" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="Обучение" />;
  }
  if (state === "error") {
    return <ErrorState title="Обучение" message={errorMessage} />;
  }
  if (!data) {
    return (
      <AppShell>
        <section className="page">
          <PageHeader title="Обучение" subtitle="Загружаем модуль…" />
        </section>
      </AppShell>
    );
  }

  const isInDevelopment = !preview && Boolean(data.isInDevelopment);
  const hasAccess = preview || (!isInDevelopment && Boolean(data.hasAccess));
  const coverUrl = preferredFileAssetImageUrl(data.coverImageId ? covers.get(data.coverImageId) : null);
  const totalLessons = (data.chapters ?? []).reduce(
    (sum: number, chapter: LearningChapterDetail) => sum + (chapter.lessons?.length ?? 0),
    0,
  );
  const firstLessonHref = (() => {
    for (const chapter of data.chapters ?? []) {
      const first = chapter.lessons?.[0];
      if (first) return `/education/${moduleId}/${first.id}${preview ? "?preview=1" : ""}`;
    }
    return null;
  })();
  const moduleBreadcrumbTrail = [
    { label: "Главная" },
    { href: "/education", label: "Обучение", icon: GraduationCap },
    { label: data.title },
  ];

  const accessLabel =
    data.accessLevel === "basic"
      ? "Базовая подписка"
      : data.accessLevel === "extended"
        ? "Расширенная подписка"
        : "Разовая покупка";

  return (
    <AppShell chrome={{ breadcrumbTrail: moduleBreadcrumbTrail }}>
      <section className="page module-page">
        {preview ? (
          <StatusPill as="p" className="cms-preview-banner" variant="warning">
            Предпросмотр курса: виден только авторизованным сотрудникам CMS.
          </StatusPill>
        ) : null}
        <header className={`module-hero${coverUrl ? "" : " no-cover"}`}>
          <div className="module-hero-cover">
            {coverUrl ? (
              <Image
                alt={data.title}
                src={coverUrl}
                fill
                sizes="(max-width: 1024px) 100vw, 600px"
                style={{ objectFit: "cover" }}
                priority
              />
            ) : (
              <div className="module-hero-cover-fallback" />
            )}
          </div>
          <div className="module-hero-body">
            <span
              className={`module-hero-status${hasAccess ? " is-open" : " is-locked"}${isInDevelopment ? " is-development" : ""}`}
            >
              {isInDevelopment ? "В разработке" : hasAccess ? "Доступен" : "Нужна подписка"}
              <span className="module-hero-status-sub">· {accessLabel}</span>
            </span>
            <h1 className="module-hero-title">{data.title}</h1>
            <p className="module-hero-summary">{data.summary}</p>
            <p className="module-hero-description">{data.description}</p>
            <div className="module-hero-meta">
              <span>
                {(data.chapters ?? []).length} {pluralizeRu((data.chapters ?? []).length, "глава", "главы", "глав")}
              </span>
              <span aria-hidden>·</span>
              <span>
                {totalLessons} {pluralizeRu(totalLessons, "урок", "урока", "уроков")}
              </span>
            </div>
            <div className="module-hero-actions">
              {hasAccess && firstLessonHref ? (
                <Link className="button" href={firstLessonHref}>
                  Начать обучение
                </Link>
              ) : !hasAccess && !isInDevelopment ? (
                <Link className="button" href="/account">
                  Активировать подписку
                </Link>
              ) : null}
              <Link className="button secondary" href="/education">
                ← К курсам
              </Link>
            </div>
          </div>
        </header>

        {!hasAccess && !isInDevelopment && data.preview ? (
          <section className="module-preview-card">
            <h2>Что внутри курса</h2>
            <p>{data.preview.promotionalDescription}</p>
            <ul className="module-preview-list">
              {data.preview.whatYouWillLearn.map((item: string, index: number) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {hasAccess ? (
          <section className="module-chapters">
            <h2 className="module-chapters-title">Программа курса</h2>
            <div className="chapters-list">
              {(data.chapters ?? []).map((chapter, index) => (
                <article className="chapter-card" key={chapter.id}>
                  <header className="chapter-card-header">
                    <span className="chapter-number">{String(index + 1).padStart(2, "0")}</span>
                    <div className="chapter-card-info">
                      <h3 className="chapter-card-title">{chapter.title}</h3>
                      <p className="chapter-card-meta">
                        {(chapter.lessons ?? []).length}{" "}
                        {pluralizeRu((chapter.lessons ?? []).length, "урок", "урока", "уроков")}
                      </p>
                    </div>
                  </header>
                  {(chapter.lessons ?? []).length === 0 ? (
                    <p className="chapter-card-empty">В этой главе пока пусто.</p>
                  ) : (
                    <ol className="lesson-list">
                      {(chapter.lessons ?? []).map((lesson, lessonIndex) => (
                        <li className="lesson-item" key={lesson.id}>
                          <Link className="lesson-item-link" href={`/education/${moduleId}/${lesson.id}`}>
                            <span className="lesson-item-index">
                              {index + 1}.{lessonIndex + 1}
                            </span>
                            <span className="lesson-item-title">{lesson.title}</span>
                            <span className="lesson-item-arrow" aria-hidden>
                              →
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </section>
    </AppShell>
  );
}
