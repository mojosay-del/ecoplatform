"use client";

// Презентация модуля обучения (hero + программа курса). Общий контент для
// полностраничного вида (LearningModuleView) и модального окна с витрины
// (ModulePresentationModal) — чтобы оформление и логика доступа были едиными.

import Link from "next/link";
import type { LearningModuleDetail } from "@ecoplatform/shared";
import { CoverImage } from "../../components/CoverImage";
import { StatusPill } from "../../components/StatusPill";
import { pluralizeRu } from "../shared";

export function ModulePresentationBody({
  data,
  moduleId,
  coverUrl,
  preview = false,
  inModal = false,
}: {
  data: LearningModuleDetail;
  moduleId: string;
  coverUrl: string | null;
  preview?: boolean;
  // В модалке закрытие — крестик/фон, поэтому кнопку «К курсам» не показываем.
  inModal?: boolean;
}) {
  const isInDevelopment = !preview && Boolean(data.isInDevelopment);
  const hasAccess = preview || (!isInDevelopment && Boolean(data.hasAccess));
  const firstLessonHref = (() => {
    for (const chapter of data.chapters ?? []) {
      const first = chapter.lessons?.[0];
      if (first) return `/education/${moduleId}/${first.id}${preview ? "?preview=1" : ""}`;
    }
    return null;
  })();
  const accessLabel =
    data.accessLevel === "basic"
      ? "Базовая подписка"
      : data.accessLevel === "extended"
        ? "Расширенная подписка"
        : "Разовая покупка";

  return (
    <>
      {preview ? (
        <StatusPill as="p" className="cms-preview-banner" variant="warning">
          Предпросмотр курса: виден только авторизованным сотрудникам CMS.
        </StatusPill>
      ) : null}
      <header className={`module-hero${coverUrl ? "" : " no-cover"}`}>
        <div className="module-hero-cover">
          {coverUrl ? (
            <CoverImage alt={data.title} src={coverUrl} sizes="(max-width: 1024px) 100vw, 820px" priority />
          ) : (
            <div className="module-hero-cover-fallback" />
          )}
          {/* Капсула доступа — оверлеем слева сверху поверх обложки, как метка
              на обложке новости. */}
          <span
            className={`module-hero-status${hasAccess ? " is-open" : " is-locked"}${isInDevelopment ? " is-development" : ""}`}
          >
            {isInDevelopment ? "В разработке" : hasAccess ? "Доступен" : "Нужна подписка"}
            <span className="module-hero-status-sub">· {accessLabel}</span>
          </span>
        </div>
        <div className="module-hero-body">
          <h1 className="module-hero-title">{data.title}</h1>
          <p className="module-hero-summary">{data.summary}</p>
          <p className="module-hero-description">{data.description}</p>
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
            {inModal ? null : (
              <Link className="button secondary" href="/education">
                ← К курсам
              </Link>
            )}
          </div>
        </div>
      </header>

      {!hasAccess && !isInDevelopment && data.preview?.promotionalDescription ? (
        <section className="module-preview-card">
          <h2>Что внутри курса</h2>
          <p>{data.preview.promotionalDescription}</p>
        </section>
      ) : null}

      {/* «Чему вы научитесь» — задаётся в CMS (preview.whatYouWillLearn) и теперь
          виден всем (раньше показывался только при отсутствии доступа). */}
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
    </>
  );
}
