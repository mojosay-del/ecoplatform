"use client";

// Презентация модуля обучения — тонкая композиция страницы курса:
// кинематографичный hero (ModuleHero), маркетинговый тизер, «Чему вы
// научитесь» и программа курса (ModuleCurriculum). Раньше использовалась и в
// модалке с витрины; модалка удалена — остался единственный полностраничный вид.

import type { LearningModuleDetail } from "@ecoplatform/shared";
import { StatusPill } from "../../components/StatusPill";
import { ModuleCurriculum } from "./ModuleCurriculum";
import { ModuleHero } from "./ModuleHero";

export function ModulePresentationBody({
  data,
  moduleId,
  coverUrl,
  preview = false,
}: {
  data: LearningModuleDetail;
  moduleId: string;
  coverUrl: string | null;
  preview?: boolean;
}) {
  const isInDevelopment = !preview && Boolean(data.isInDevelopment);
  const hasAccess = preview || (!isInDevelopment && Boolean(data.hasAccess));

  return (
    <>
      {preview ? (
        <StatusPill as="p" className="cms-preview-banner" variant="warning">
          Предпросмотр курса: виден только авторизованным сотрудникам CMS.
        </StatusPill>
      ) : null}

      <ModuleHero
        data={data}
        moduleId={moduleId}
        coverUrl={coverUrl}
        hasAccess={hasAccess}
        isInDevelopment={isInDevelopment}
        preview={preview}
      />

      {!hasAccess && !isInDevelopment && data.preview?.promotionalDescription ? (
        <section className="module-preview-card">
          <h2>Что внутри курса</h2>
          <p>{data.preview.promotionalDescription}</p>
        </section>
      ) : null}

      {/* «Чему вы научитесь» — задаётся в CMS (preview.whatYouWillLearn), виден всем. */}
      {data.preview?.whatYouWillLearn?.length ? (
        <section className="module-outcomes">
          <h2 className="module-outcomes-title">Чему вы научитесь</h2>
          <ul className="module-outcomes-list">
            {data.preview.whatYouWillLearn.map((item: string, index: number) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Программа видна всем: без доступа строки уроков закрыты замками. */}
      {(data.chapters ?? []).length > 0 && !isInDevelopment ? (
        <ModuleCurriculum chapters={data.chapters ?? []} moduleId={moduleId} hasAccess={hasAccess} preview={preview} />
      ) : null}
    </>
  );
}
