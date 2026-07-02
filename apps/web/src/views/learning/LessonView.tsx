"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { GraduationCap } from "lucide-react";
import type { LearningChapterDetail, LearningModuleDetail, LessonDetail } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { CoverImage } from "../../components/CoverImage";
import { StatusPill } from "../../components/StatusPill";
import { ApiError, api, preferredFileAssetImageUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useCoverAssets } from "../../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, resolveUpgradeCta, useApiQuery } from "../shared";
import { ContentBlocks } from "../content-blocks";
import { extractLessonTasks } from "./lesson-tasks";
import { lessonNavigation } from "./lesson-sequence";
import { LessonAttachments } from "./LessonAttachments";
import { LessonOutline } from "./LessonOutline";
import { ModuleCompletionCelebration } from "./ModuleCompletionCelebration";

export function LessonView({
  moduleId,
  lessonId,
  preview = false,
}: {
  moduleId: string;
  lessonId: string;
  preview?: boolean;
}) {
  const router = useRouter();
  const { token, user } = useAuth();
  const lessonMainRef = useRef<HTMLElement>(null);
  const { data, state, errorMessage } = useApiQuery<LearningModuleDetail | null>(
    `learning-module:${moduleId}:${preview ? "preview" : "public"}`,
    () => api.learning.getModule(moduleId, { preview }),
    null,
  );
  const [completed, setCompleted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  // Пока не загрузятся ВСЕ изображения урока — держим статью серой и пульсирующей,
  // затем показываем её разом с мягким появлением. Так нет ощущения «догрузки на ходу».
  const [articleReady, setArticleReady] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const chapters: LearningChapterDetail[] = useMemo(() => data?.chapters ?? [], [data?.chapters]);
  const navigation = lessonNavigation(chapters, lessonId);
  const chapter = navigation.current?.chapter ?? null;
  const lesson: LessonDetail | null = navigation.current?.lesson ?? null;
  const previewSuffix = preview ? "?preview=1" : "";
  const moduleHref = `/education/${moduleId}${previewSuffix}`;
  const previousLessonHref = navigation.previous
    ? `/education/${moduleId}/${navigation.previous.lesson.id}${previewSuffix}`
    : null;
  const nextLessonHref = navigation.next ? `/education/${moduleId}/${navigation.next.lesson.id}${previewSuffix}` : null;
  const nextLessonLabel = navigation.nextLabel;
  // Пройденные уроки для оглавления: серверные отметки + локальная (текущий
  // урок, отмеченный в этой сессии до рефетча).
  const completedLessonIds = useMemo(() => {
    const ids = new Set<string>();
    for (const outlineChapter of chapters) {
      for (const outlineLesson of outlineChapter.lessons ?? []) {
        if (outlineLesson.completedAt) ids.add(outlineLesson.id);
      }
    }
    if (completed) ids.add(lessonId);
    return ids;
  }, [chapters, completed, lessonId]);
  const covers = useCoverAssets(lesson ? [lesson] : []);
  const lessonCover = lesson?.coverImageId ? (covers.get(lesson.coverImageId) ?? null) : null;
  const lessonCoverUrl = preferredFileAssetImageUrl(lessonCover);
  useEffect(() => {
    setCompleted(Boolean(lesson?.completedAt));
    setCompleting(false);
    setAdvancing(false);
    setCompletionError(null);
    setCelebrating(false);
  }, [lesson?.completedAt, lessonId]);

  useEffect(() => {
    const container = lessonMainRef.current;
    if (!container) return;

    setArticleReady(false);

    const images = Array.from(container.querySelectorAll<HTMLImageElement>("img"));
    if (images.length === 0) {
      setArticleReady(true);
      return;
    }

    let settled = false;
    let remaining = images.length;
    const cleanups: Array<() => void> = [];

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanups.forEach((fn) => fn());
      setArticleReady(true);
    };

    const markOne = () => {
      remaining -= 1;
      if (remaining <= 0) finish();
    };

    images.forEach((img) => {
      // Картинка из кеша могла догрузиться до навешивания слушателей — проверяем
      // complete/naturalWidth, иначе ждём load/error (ошибку тоже считаем «готово»,
      // чтобы битый файл не держал статью серой).
      if (img.complete && img.naturalWidth > 0) {
        markOne();
        return;
      }
      const cleanup = () => {
        img.removeEventListener("load", onSettled);
        img.removeEventListener("error", onSettled);
      };
      function onSettled() {
        cleanup();
        markOne();
      }
      img.addEventListener("load", onSettled);
      img.addEventListener("error", onSettled);
      cleanups.push(cleanup);
    });

    // Если все картинки уже были готовы синхронно — finish уже вызван внутри markOne.
    // Фолбэк: не держать статью серой вечно из-за зависшей картинки.
    const fallback = window.setTimeout(finish, 6000);
    cleanups.push(() => window.clearTimeout(fallback));

    return () => {
      settled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [lesson?.blocks?.length, lessonCoverUrl, lessonId]);

  if (state === "unauthenticated") {
    return <AuthRequired title="Урок" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="Урок" />;
  }
  if (state === "error") {
    return <ErrorState title="Урок" message={errorMessage} />;
  }
  if (!data) {
    return (
      <AppShell>
        <section className="page">
          <PageHeader title="Урок" />
          <div className="page-skeleton-body page-skeleton-article" aria-busy="true">
            <div className="page-skeleton-card u-minh-260" />
            <div className="page-skeleton-bar w-3-4" />
            <div className="page-skeleton-bar w-full" />
            <div className="page-skeleton-bar w-full" />
            <div className="page-skeleton-bar w-1-2" />
          </div>
        </section>
      </AppShell>
    );
  }

  if (!lesson) {
    return <ErrorState title="Урок" message="Урок не найден или не опубликован." />;
  }

  if (!preview && data.isInDevelopment) {
    return <AccessClosed title="В разработке" />;
  }

  if (!preview && !data.hasAccess) {
    return <AccessClosed title={lesson.title} />;
  }

  const lessonAlreadyCompleted = Boolean(lesson.completedAt) || completed;

  // true — если именно эта отметка довела модуль до 100% (тогда празднуем).
  function completionFinishesModule() {
    const total = data?.progress?.totalLessons ?? 0;
    const alreadyCompleted = data?.progress?.completedLessons ?? 0;
    return total > 0 && !lesson?.completedAt && alreadyCompleted + 1 >= total;
  }

  async function completeCurrentLesson() {
    if (lessonAlreadyCompleted) return { saved: true, finishedModule: false };
    if (!token) {
      setCompletionError("Не удалось сохранить прохождение. Обновите страницу и попробуйте снова.");
      return { saved: false, finishedModule: false };
    }

    try {
      const finishedModule = completionFinishesModule();
      await api.learning.completeLesson(lessonId);
      setCompleted(true);
      if (finishedModule) setCelebrating(true);
      return { saved: true, finishedModule };
    } catch (error) {
      setCompletionError(
        error instanceof ApiError ? error.message : "Не удалось сохранить прохождение. Попробуйте ещё раз.",
      );
      return { saved: false, finishedModule: false };
    }
  }

  async function markCompleted() {
    if (completing || advancing) return;
    setCompleting(true);
    setCompletionError(null);
    await completeCurrentLesson();
    setCompleting(false);
  }

  async function goToNextLesson() {
    if (!nextLessonHref || advancing || completing) return;
    setAdvancing(true);
    setCompletionError(null);
    const { saved, finishedModule } = await completeCurrentLesson();
    if (!saved) {
      setAdvancing(false);
      return;
    }
    // Модуль закрыт этой отметкой — вместо перехода показываем празднование.
    if (finishedModule) {
      setAdvancing(false);
      return;
    }
    router.push(nextLessonHref);
  }

  const totalLessons =
    data.progress?.totalLessons ??
    (data.chapters ?? []).reduce((sum: number, ch: LearningChapterDetail) => sum + (ch.lessons ?? []).length, 0);
  const completedLessons = Math.min(
    totalLessons,
    (data.progress?.completedLessons ?? 0) + (completed && !lesson.completedAt ? 1 : 0),
  );
  const progressPercent = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);

  const upgradeCta = preview ? null : resolveUpgradeCta(user);
  const lessonTasks = extractLessonTasks(lesson.blocks ?? []);
  const lessonContentBlocks = (lesson.blocks ?? []).filter((block) => block.type !== "lesson_tasks");
  const lessonBreadcrumbTrail = [
    { label: "Главная" },
    { href: "/education", label: "Обучение", icon: GraduationCap },
    { href: moduleHref, label: data.title },
    { label: lesson.title },
  ];

  return (
    <AppShell chrome={{ breadcrumbTrail: lessonBreadcrumbTrail }}>
      <section className="page lesson-page">
        {preview ? (
          <StatusPill as="p" className="cms-preview-banner" variant="warning">
            Предпросмотр урока: прогресс и отметка прохождения отключены.
          </StatusPill>
        ) : null}
        {upgradeCta ? (
          <div className="lesson-upgrade-banner">
            <div>
              <strong>{upgradeCta.title}</strong>
              <p>{upgradeCta.description}</p>
            </div>
            <Link className="button" href="/account">
              {upgradeCta.buttonLabel}
            </Link>
          </div>
        ) : null}

        {chapter ? (
          <div className="lesson-context">
            <Link className="lesson-context-module" href={moduleHref}>
              {data.title}
            </Link>
            <span className="lesson-context-position">
              Глава {(navigation.current?.chapterIndex ?? 0) + 1} · Урок {navigation.position} из {navigation.total}
            </span>
            {!preview ? (
              <div aria-hidden="true" className="lesson-context-progress">
                <span style={{ width: `${progressPercent}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="lesson-layout">
          <article
            className={`lesson-main${articleReady ? " is-images-ready" : " is-loading-images"}`}
            ref={lessonMainRef}
          >
            {!articleReady ? <div className="lesson-loading-overlay" aria-hidden="true" /> : null}
            {lessonCoverUrl ? (
              <figure className="lesson-cover">
                <CoverImage alt={lesson.title} src={lessonCoverUrl} eager sizes="(max-width: 1100px) 100vw, 760px" />
                <div className="lesson-cover-title-wrap">
                  <div className="lesson-cover-caption">
                    <h1 className="lesson-title lesson-title-on-cover">{lesson.title}</h1>
                    {lesson.coverSubtitle ? <p className="lesson-cover-subtitle">{lesson.coverSubtitle}</p> : null}
                  </div>
                </div>
              </figure>
            ) : (
              <h1 className="lesson-title">{lesson.title}</h1>
            )}
            <div className="content-blocks lesson-blocks">
              <ContentBlocks blocks={lessonContentBlocks} />
            </div>
            {!preview ? (
              <div className="form-actions lesson-actions u-mt-24">
                <div className="lesson-actions-left">
                  <Link className="button secondary" href={moduleHref}>
                    ← К модулю
                  </Link>
                  {previousLessonHref ? (
                    <Link className="button secondary" href={previousLessonHref}>
                      Предыдущий урок
                    </Link>
                  ) : null}
                </div>
                <div className="lesson-actions-right">
                  {nextLessonHref && nextLessonLabel ? (
                    <button
                      className="button lesson-next-button"
                      type="button"
                      onClick={goToNextLesson}
                      disabled={advancing || completing}
                    >
                      {advancing ? "Сохраняю…" : nextLessonLabel}
                    </button>
                  ) : (
                    <button
                      className="button"
                      type="button"
                      onClick={markCompleted}
                      disabled={lessonAlreadyCompleted || completing}
                    >
                      {lessonAlreadyCompleted
                        ? "Отмечено пройденным"
                        : completing
                          ? "Сохраняю…"
                          : "Отметить пройденным"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="form-actions lesson-actions u-mt-24">
                <div className="lesson-actions-left">
                  <Link className="button secondary" href={moduleHref}>
                    ← К модулю
                  </Link>
                  {previousLessonHref ? (
                    <Link className="button secondary" href={previousLessonHref}>
                      Предыдущий урок
                    </Link>
                  ) : null}
                </div>
              </div>
            )}
            {completionError && !preview ? <p className="lesson-action-error">{completionError}</p> : null}
          </article>

          <aside className="lesson-sidebar">
            {!preview ? (
              <div className="lesson-side-card">
                <div className="lesson-side-card-header">Прогресс модуля</div>
                <div className="lesson-progress">
                  <div className="lesson-progress-ring" style={{ "--progress": progressPercent } as CSSProperties}>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="lesson-progress-meta">
                    <strong>{data.title}</strong>
                    <span>
                      Уроки завершены: {completedLessons} из {totalLessons}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <LessonOutline
              chapters={chapters}
              completedLessonIds={completedLessonIds}
              currentLessonId={lessonId}
              moduleId={moduleId}
              previewSuffix={previewSuffix}
            />

            {lessonTasks.length > 0 ? (
              <div className="lesson-side-card">
                <div className="lesson-side-card-header">Задания урока</div>
                <ul className="lesson-task-list">
                  {lessonTasks.map((task, index) => (
                    <li className={lessonAlreadyCompleted ? "done" : ""} key={`${task.title}-${index}`}>
                      <span className="lesson-task-icon">{lessonAlreadyCompleted ? "✓" : index + 1}</span>
                      <div>
                        <strong>{task.title}</strong>
                        {task.description ? <span>{task.description}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {(lesson.attachments ?? []).length > 0 ? (
              <div className="lesson-side-card">
                <div className="lesson-side-card-header">Материалы урока</div>
                <LessonAttachments attachments={lesson.attachments ?? []} />
              </div>
            ) : null}
          </aside>
        </div>

        {celebrating && !preview ? (
          <ModuleCompletionCelebration
            moduleHref={moduleHref}
            moduleTitle={data.title}
            onClose={() => setCelebrating(false)}
          />
        ) : null}
      </section>
    </AppShell>
  );
}
