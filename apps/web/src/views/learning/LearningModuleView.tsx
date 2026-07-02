"use client";

import { GraduationCap } from "lucide-react";
import type { LearningModuleDetail } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api, preferredFileAssetImageUrl } from "../../lib/api";
import { useCoverAssets } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, useApiQuery } from "../shared";
import { ModulePresentationBody } from "./module-presentation";

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
    // Hero-образный скелетон: тёмная зона будущего hero + пара плашек программы.
    return (
      <AppShell>
        <section className="page module-page" aria-busy="true">
          <div className="module-hero-skeleton" aria-hidden="true">
            <div className="page-skeleton-bar w-1-2" />
            <div className="page-skeleton-bar w-3-4" />
            <div className="page-skeleton-bar w-full" />
            <div className="page-skeleton-bar w-1-2" />
          </div>
          <div className="module-chapter-skeleton" aria-hidden="true">
            <div className="page-skeleton-bar w-1-2" />
            <div className="page-skeleton-bar w-full" />
            <div className="page-skeleton-bar w-3-4" />
          </div>
        </section>
      </AppShell>
    );
  }

  const coverUrl = preferredFileAssetImageUrl(data.coverImageId ? covers.get(data.coverImageId) : null);
  const moduleBreadcrumbTrail = [
    { label: "Главная" },
    { href: "/education", label: "Обучение", icon: GraduationCap },
    { label: data.title },
  ];

  return (
    <AppShell chrome={{ breadcrumbTrail: moduleBreadcrumbTrail }}>
      <section className="page module-page">
        <ModulePresentationBody data={data} moduleId={moduleId} coverUrl={coverUrl} preview={preview} />
      </section>
    </AppShell>
  );
}
