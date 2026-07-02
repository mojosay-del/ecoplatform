"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { LearningModuleListItem, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import "../../components/cover.css";
import { api, preferredFileAssetImageUrl } from "../../lib/api";
import { useCoverAssets } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, pluralizeRu, useApiQuery } from "../shared";
import { ContinueLearningCard } from "./ContinueLearningCard";
import { EducationModuleCard, EducationModuleCardSkeleton } from "./EducationModuleCard";
import { pickResumeModule } from "./learning-format";

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

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
  const reducedMotion = useReducedMotion();
  const resumeModule = useMemo(() => pickResumeModule(data), [data]);
  const lessonsCount = useMemo(() => data.reduce((sum, module) => sum + module.totalLessons, 0), [data]);
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

  const coverUrlFor = (module: LearningModuleListItem) =>
    preferredFileAssetImageUrl(module.coverImageId ? covers.get(module.coverImageId) : null);

  return (
    <AppShell>
      <section className="page">
        <header className="education-header">
          <p className="education-eyebrow">Академия ЭкоПлатформы</p>
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
          <>
            {resumeModule ? <ContinueLearningCard coverUrl={coverUrlFor(resumeModule)} module={resumeModule} /> : null}
            <motion.div
              animate="visible"
              className="education-grid"
              initial={reducedMotion ? false : "hidden"}
              variants={gridVariants}
            >
              {data.map((module) => (
                <motion.div className="education-grid-cell" key={module.id} variants={cardVariants}>
                  <EducationModuleCard coverUrl={coverUrlFor(module)} module={module} />
                </motion.div>
              ))}
            </motion.div>
          </>
        )}
      </section>
    </AppShell>
  );
}
