"use client";

import Link from "next/link";
import Image from "next/image";
import type { LearningChapterSummary, LearningModuleListItem, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { StatusPill } from "../../components/StatusPill";
import { api, preferredFileAssetImageUrl } from "../../lib/api";
import { useCoverAssets } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";

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
        <PageHeader title="Обучение" />
        <div className="education-grid">
          {data.map((module) => {
            const lessonsCount =
              module.chapters?.reduce(
                (sum: number, chapter: LearningChapterSummary) => sum + (chapter.lessons?.length ?? 0),
                0,
              ) ?? 0;
            const isInDevelopment = Boolean(module.isInDevelopment);
            const cover = module.coverImageId ? covers.get(module.coverImageId) : null;
            const coverUrl = preferredFileAssetImageUrl(cover);
            return (
              <article className="education-card" key={module.id}>
                <Link className="education-card-link" href={`/education/${module.id}`}>
                  <div className="education-card-cover">
                    {coverUrl ? (
                      <Image
                        alt=""
                        src={coverUrl}
                        fill
                        sizes="(max-width: 880px) 100vw, (max-width: 1180px) 35vw, (max-width: 1500px) 25vw, 480px"
                        style={{ objectFit: "cover" }}
                      />
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
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
