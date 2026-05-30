"use client";

// Раздел «Обучение»: список модулей, страница модуля, страница урока.
// Вынесены из DataViews.tsx как изолированный учебный домен — три view
// тесно связаны между собой, но не делят state с новостями/индексами/КБ.

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Download,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Presentation,
} from "lucide-react";
import type {
  LearningChapterDetail,
  LearningChapterSummary,
  LearningModuleDetail,
  LearningModuleListItem,
  LessonDetail,
  PaginatedResponse,
} from "@ecoplatform/shared";
import { AppShell } from "../components/AppShell";
import { StatusPill } from "../components/StatusPill";
import { ApiError, api, preferredFileAssetImageUrl, type FileAsset } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCoverAssets } from "../lib/use-cover-assets";
import {
  AccessClosed,
  AuthRequired,
  ErrorState,
  PageHeader,
  pluralizeRu,
  resolveUpgradeCta,
  useApiQuery,
} from "./_shared";
import { ContentBlocks } from "./content-blocks";

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
                        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
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

  const accessLabel =
    data.accessLevel === "basic"
      ? "Базовая подписка"
      : data.accessLevel === "extended"
        ? "Расширенная подписка"
        : "Разовая покупка";

  return (
    <AppShell>
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
  const { data, state, errorMessage } = useApiQuery<LearningModuleDetail | null>(
    `learning-module:${moduleId}:${preview ? "preview" : "public"}`,
    () => api.learning.getModule(moduleId, { preview }),
    null,
  );
  const [completed, setCompleted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const chapters: LearningChapterDetail[] = data?.chapters ?? [];
  const chapter = chapters.find((c) => (c.lessons ?? []).some((l) => l.id === lessonId));
  const lesson: LessonDetail | null = chapter ? ((chapter.lessons ?? []).find((l) => l.id === lessonId) ?? null) : null;
  const lessonSequence = chapters.flatMap((sequenceChapter, chapterIndex) =>
    (sequenceChapter.lessons ?? []).map((sequenceLesson, lessonIndex) => ({
      chapter: sequenceChapter,
      chapterIndex,
      lesson: sequenceLesson,
      lessonIndex,
    })),
  );
  const currentLessonIndex = lessonSequence.findIndex((item) => item.lesson.id === lessonId);
  const nextLessonEntry = currentLessonIndex >= 0 ? (lessonSequence[currentLessonIndex + 1] ?? null) : null;
  const previewSuffix = preview ? "?preview=1" : "";
  const moduleHref = `/education/${moduleId}${previewSuffix}`;
  const nextLessonHref = nextLessonEntry ? `/education/${moduleId}/${nextLessonEntry.lesson.id}${previewSuffix}` : null;
  const nextLessonLabel = nextLessonEntry
    ? nextLessonEntry.chapter.id !== chapter?.id
      ? `Следующая глава: урок ${nextLessonEntry.lessonIndex + 1}`
      : "Следующий урок"
    : null;

  useEffect(() => {
    setCompleted(Boolean(lesson?.completedAt));
    setCompleting(false);
    setAdvancing(false);
    setCompletionError(null);
  }, [lesson?.completedAt, lessonId]);

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
          <PageHeader title="Урок" subtitle="Загружаем…" />
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

  async function completeCurrentLesson() {
    if (lessonAlreadyCompleted) return true;
    if (!token) {
      setCompletionError("Не удалось сохранить прохождение. Обновите страницу и попробуйте снова.");
      return false;
    }

    try {
      await api.learning.completeLesson(lessonId);
      setCompleted(true);
      return true;
    } catch (error) {
      setCompletionError(
        error instanceof ApiError ? error.message : "Не удалось сохранить прохождение. Попробуйте ещё раз.",
      );
      return false;
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
    const saved = await completeCurrentLesson();
    if (!saved) {
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

  return (
    <AppShell>
      <section className="page lesson-page">
        {preview ? (
          <StatusPill as="p" className="cms-preview-banner" variant="warning">
            Предпросмотр урока: прогресс и отметка прохождения отключены.
          </StatusPill>
        ) : null}
        <nav className="lesson-breadcrumb">
          <Link href="/education">Главная</Link>
          <span>/</span>
          <Link href="/education">Курсы</Link>
          <span>/</span>
          <Link href={moduleHref}>{data.title}</Link>
          <span>/</span>
          <span className="lesson-breadcrumb-current">{lesson.title}</span>
        </nav>

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

        <div className="lesson-layout">
          <article className="lesson-main">
            <h1 className="lesson-title">{lesson.title}</h1>
            <div className="content-blocks lesson-blocks">
              <ContentBlocks blocks={lessonContentBlocks} />
            </div>
            {!preview ? (
              <div className="auth-actions lesson-actions" style={{ marginTop: 24 }}>
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
                    {lessonAlreadyCompleted ? "Отмечено пройденным" : completing ? "Сохраняю…" : "Отметить пройденным"}
                  </button>
                )}
                {nextLessonHref ? (
                  <button
                    className="button secondary"
                    type="button"
                    onClick={markCompleted}
                    disabled={lessonAlreadyCompleted || completing || advancing}
                  >
                    {lessonAlreadyCompleted ? "Отмечено пройденным" : completing ? "Сохраняю…" : "Отметить пройденным"}
                  </button>
                ) : null}
                <Link className="button secondary" href={moduleHref}>
                  ← К модулю
                </Link>
              </div>
            ) : (
              <div className="auth-actions lesson-actions" style={{ marginTop: 24 }}>
                <Link className="button secondary" href={moduleHref}>
                  ← К модулю
                </Link>
              </div>
            )}
            {completionError && !preview ? <p className="lesson-action-error">{completionError}</p> : null}
          </article>

          <aside className="lesson-sidebar">
            {!preview ? (
              <div className="lesson-side-card">
                <div className="lesson-side-card-header">Прогресс курса</div>
                <div className="lesson-progress">
                  <div className="lesson-progress-ring" style={{ ["--progress" as any]: progressPercent }}>
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
      </section>
    </AppShell>
  );
}

type LessonTask = { title: string; description?: string };

function extractLessonTasks(blocks: Array<{ type: string; payload: Record<string, unknown> }>): LessonTask[] {
  return blocks.flatMap((block) => {
    if (block.type !== "lesson_tasks" || !Array.isArray(block.payload.tasks)) {
      return [];
    }

    return block.payload.tasks.flatMap((rawTask) => {
      if (!rawTask || typeof rawTask !== "object") {
        return [];
      }
      const task = rawTask as Record<string, unknown>;
      const title = typeof task.title === "string" ? task.title.trim() : "";
      const description = typeof task.description === "string" ? task.description.trim() : "";
      if (!title) {
        return [];
      }
      return [{ title, ...(description ? { description } : {}) }];
    });
  });
}

function LessonAttachments({ attachments }: { attachments: Array<{ fileId: string; displayName: string }> }) {
  const { token } = useAuth();
  const [assets, setAssets] = useState<Map<string, FileAsset>>(new Map());
  const ids = attachments
    .map((a) => a.fileId)
    .filter(Boolean)
    .sort();
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!token || ids.length === 0) {
      setAssets(new Map());
      return;
    }
    api.files
      .listByIds(ids)
      .then((result) => setAssets(new Map(result.map((asset) => [asset.id, asset]))))
      .catch(() => setAssets(new Map()));
  }, [idsKey, ids.length, token]);

  return (
    <div className="lesson-material-list">
      {attachments.map((attachment, index) => {
        const asset = assets.get(attachment.fileId);
        const Icon = resolveLessonMaterialIcon(asset, attachment.displayName);
        return (
          <div className="lesson-material-item" key={index}>
            <span className="lesson-material-icon" aria-hidden>
              <Icon size={16} />
            </span>
            <strong className="lesson-material-title" title={attachment.displayName}>
              {attachment.displayName}
            </strong>
            {asset?.publicUrl ? (
              <a
                className="lesson-material-download"
                href={asset.publicUrl}
                download={attachment.displayName}
                rel="noreferrer"
                target="_blank"
                title={`Скачать ${attachment.displayName}`}
                aria-label={`Скачать ${attachment.displayName}`}
              >
                <Download size={15} />
                <span>Скачать</span>
              </a>
            ) : (
              <span className="lesson-material-unavailable">Недоступен</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function resolveLessonMaterialIcon(asset: FileAsset | undefined, displayName: string) {
  const mimeType = asset?.mimeType.toLowerCase() ?? "";
  const fileName = `${asset?.originalName ?? ""} ${displayName}`.toLowerCase();

  if (mimeType.startsWith("image/") || /\.(avif|gif|jpe?g|png|webp)$/.test(fileName)) return FileImage;
  if (mimeType.startsWith("video/") || /\.(mp4|webm)$/.test(fileName)) return FileVideoCamera;
  if (mimeType.startsWith("audio/") || /\.(mp3|ogg|wav|weba)$/.test(fileName)) return FileMusic;
  if (mimeType.includes("spreadsheet") || mimeType.includes("ms-excel") || /\.(xls|xlsx)$/.test(fileName)) {
    return FileSpreadsheet;
  }
  if (mimeType.includes("presentation") || mimeType.includes("ms-powerpoint") || /\.(ppt|pptx)$/.test(fileName)) {
    return Presentation;
  }
  if (mimeType.includes("zip") || /\.zip$/.test(fileName)) return FileArchive;
  if (
    mimeType === "application/pdf" ||
    mimeType.includes("word") ||
    mimeType.includes("msword") ||
    /\.(doc|docx|pdf)$/.test(fileName)
  ) {
    return FileText;
  }
  return FileIcon;
}
