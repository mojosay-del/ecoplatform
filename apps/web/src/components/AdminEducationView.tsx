"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronRight, ExternalLink, FileText, FolderOpen, Paperclip, Plus, Trash2 } from "lucide-react";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "./AppShell";
import type { Block } from "../lib/editor/block-types";
import { DocumentEditor } from "./editor/DocumentEditor";
import type { AtomicBlockKind } from "../lib/editor/block-mapping";
import { FileUploadField } from "./FileUploadField";
import { RowKebab, type ActionItem } from "./RowKebab";
import { StatusPill } from "./StatusPill";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canAutosaveDraft, useCmsAutosave, useUnsavedChangesWarning } from "../lib/cms-autosave";
import { CONTENT_STATUS_LABELS, LEARNING_ACCESS_LEVEL_LABELS } from "../lib/display-labels";

type Attachment = { fileId: string; displayName: string };

type LessonDraft = {
  title: string;
  blocks: Block[];
  attachments: Attachment[];
};

type Lesson = {
  id: string;
  chapterId: string;
  title: string;
  position: number;
  status: "draft" | "published";
  blocks: Block[];
  attachments: Attachment[];
};

type Chapter = {
  id: string;
  moduleId: string;
  title: string;
  position: number;
  lessons: Lesson[];
};

type Preview = { promotionalDescription: string; whatYouWillLearn: string[] };

type LearningModule = {
  id: string;
  title: string;
  summary: string;
  description: string;
  coverImageId: string | null;
  accessLevel: "basic" | "extended" | "one_time";
  oneTimePrice: number | null;
  isInDevelopment: boolean;
  status: "draft" | "published";
  preview: Preview | null;
  chapters: Chapter[];
};

type ViewState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

type Selection =
  | { kind: "none" }
  | { kind: "module"; id: string }
  | { kind: "chapter"; id: string }
  | { kind: "lesson"; id: string };

function normalizeAttachments(attachments: Attachment[]) {
  return attachments
    .map((attachment) => ({
      fileId: attachment.fileId.trim(),
      displayName: attachment.displayName.trim(),
    }))
    .filter((attachment) => attachment.fileId && attachment.displayName);
}

function lessonToDraft(lesson: Lesson): LessonDraft {
  return {
    title: lesson.title,
    blocks: lesson.blocks.map((block) => ({ type: block.type, payload: { ...block.payload } })),
    attachments: lesson.attachments.map((attachment) => ({ ...attachment })),
  };
}

function normalizeLessonDraft(draft: LessonDraft) {
  return {
    title: draft.title,
    blocks: draft.blocks.map((block) => ({ type: block.type, payload: block.payload })),
    attachments: normalizeAttachments(draft.attachments),
  };
}

// Атомарные блоки, доступные в уроках (текстовые блоки всегда доступны через
// панель и меню «/»). Аудио/файл/чек-листы в уроки не добавляем — для
// материалов есть отдельная секция вложений.
const LESSON_ATOMIC_KINDS: AtomicBlockKind[] = ["image", "gallery", "video", "lesson_tasks", "quiz", "matching"];

const MODULE_ACCESS_OPTIONS: LearningModule["accessLevel"][] = ["basic", "extended", "one_time"];

export function AdminEducationView() {
  const { token } = useAuth();
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [message, setMessage] = useState<string | null>(null);

  async function loadAll() {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const data = await apiFetch<PaginatedResponse<LearningModule>>("/admin/content/education?limit=200", { token });
      setModules(data.items);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить курсы");
    }
  }

  async function mutate(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    if (!token) return false;
    setMessage(null);
    try {
      await apiFetch(path, { method, token, body });
      await loadAll();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения.");
      return false;
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const selectedModule = useMemo(() => {
    if (selection.kind === "module") return modules.find((m) => m.id === selection.id) ?? null;
    if (selection.kind === "chapter") {
      const chapter = findChapter(modules, selection.id);
      return chapter ? (modules.find((m) => m.id === chapter.moduleId) ?? null) : null;
    }
    if (selection.kind === "lesson") {
      const lesson = findLesson(modules, selection.id);
      if (!lesson) return null;
      const chapter = findChapter(modules, lesson.chapterId);
      return chapter ? (modules.find((m) => m.id === chapter.moduleId) ?? null) : null;
    }
    return null;
  }, [modules, selection]);

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Обучение</h1>
          <p className="page-subtitle">Войдите как администратор или контент-менеджер.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / Обучение</h1>
          <p className="page-subtitle">Раздел доступен админу и контент-менеджеру.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Обучение</h1>
          <p className="page-subtitle">Модули, главы и уроки. Структура справа — детали слева.</p>
        </header>
        {message ? (
          <StatusPill as="p" variant="danger">
            {message}
          </StatusPill>
        ) : null}

        <div className="moderation-layout cms-vertical-layout">
          <div className="education-tree">
            <EducationTree modules={modules} selection={selection} onSelect={setSelection} onMutate={mutate} />
          </div>
          <div className="moderation-detail">
            <DetailPanel selection={selection} modules={modules} onSelect={setSelection} onMutate={mutate} />
          </div>
        </div>
        {selectedModule ? <p className="page-subtitle">Контекст: {selectedModule.title}</p> : null}
      </section>
    </AppShell>
  );
}

function EducationTree({
  modules,
  selection,
  onSelect,
  onMutate,
}: {
  modules: LearningModule[];
  selection: Selection;
  onSelect: (s: Selection) => void;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

  // Авто-раскрытие ветки, в которой находится текущий выбор.
  useEffect(() => {
    if (selection.kind === "none") return;
    if (selection.kind === "module") {
      setExpandedModules((prev) => (prev.has(selection.id) ? prev : new Set(prev).add(selection.id)));
      return;
    }
    if (selection.kind === "chapter") {
      const chapter = findChapter(modules, selection.id);
      if (!chapter) return;
      setExpandedModules((prev) => (prev.has(chapter.moduleId) ? prev : new Set(prev).add(chapter.moduleId)));
      setExpandedChapters((prev) => (prev.has(chapter.id) ? prev : new Set(prev).add(chapter.id)));
      return;
    }
    if (selection.kind === "lesson") {
      const lesson = findLesson(modules, selection.id);
      if (!lesson) return;
      const chapter = findChapter(modules, lesson.chapterId);
      if (!chapter) return;
      setExpandedModules((prev) => (prev.has(chapter.moduleId) ? prev : new Set(prev).add(chapter.moduleId)));
      setExpandedChapters((prev) => (prev.has(chapter.id) ? prev : new Set(prev).add(chapter.id)));
    }
  }, [selection, modules]);

  function toggleModule(id: string) {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleChapter(id: string) {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function publishToggleModule(module: LearningModule) {
    const path =
      module.status === "published"
        ? `/admin/content/education/modules/${module.id}/unpublish`
        : `/admin/content/education/modules/${module.id}/publish`;
    await onMutate(path, "POST");
  }

  async function removeModule(module: LearningModule) {
    if (!confirm(`Удалить модуль «${module.title}»? Все главы и уроки будут удалены.`)) return;
    await onMutate(`/admin/content/education/modules/${module.id}`, "DELETE");
  }

  async function addChapter(module: LearningModule) {
    await onMutate(`/admin/content/education/modules/${module.id}/chapters`, "POST", {
      title: `Глава ${module.chapters.length + 1}`,
      position: module.chapters.length,
    });
  }

  async function moveChapter(module: LearningModule, chapter: Chapter, direction: -1 | 1) {
    const newPosition = chapter.position + direction;
    if (newPosition < 0 || newPosition >= module.chapters.length) return;
    await onMutate(`/admin/content/education/chapters/${chapter.id}`, "PATCH", {
      position: newPosition,
    });
  }

  async function removeChapter(chapter: Chapter) {
    if (!confirm(`Удалить главу «${chapter.title}»?`)) return;
    await onMutate(`/admin/content/education/chapters/${chapter.id}`, "DELETE");
  }

  async function addLesson(chapter: Chapter) {
    await onMutate(`/admin/content/education/chapters/${chapter.id}/lessons`, "POST", {
      title: `Урок ${chapter.lessons.length + 1}`,
      position: chapter.lessons.length,
      blocks: [],
      attachments: [],
    });
  }

  async function moveLesson(chapter: Chapter, lesson: Lesson, direction: -1 | 1) {
    const newPosition = lesson.position + direction;
    if (newPosition < 0 || newPosition >= chapter.lessons.length) return;
    await onMutate(`/admin/content/education/lessons/${lesson.id}`, "PATCH", {
      position: newPosition,
    });
  }

  async function publishToggleLesson(lesson: Lesson) {
    const path =
      lesson.status === "published"
        ? `/admin/content/education/lessons/${lesson.id}/unpublish`
        : `/admin/content/education/lessons/${lesson.id}/publish`;
    await onMutate(path, "POST");
  }

  async function removeLesson(lesson: Lesson) {
    if (!confirm(`Удалить урок «${lesson.title}»?`)) return;
    await onMutate(`/admin/content/education/lessons/${lesson.id}`, "DELETE");
  }

  return (
    <>
      <div className="education-tree-header">
        <span className="education-tree-title">Структура курсов</span>
        <button
          className="education-tree-add"
          type="button"
          onClick={() => setCreateOpen((value) => !value)}
          title={createOpen ? "Скрыть форму" : "Новый модуль"}
          aria-label={createOpen ? "Скрыть форму" : "Новый модуль"}
        >
          <Plus size={14} />
        </button>
      </div>
      {createOpen ? <ModuleCreateForm onMutate={onMutate} onClose={() => setCreateOpen(false)} /> : null}
      {modules.length === 0 ? <p className="education-tree-empty">Модулей пока нет.</p> : null}
      <ul className="tree" role="tree">
        {modules.map((module) => {
          const isExpanded = expandedModules.has(module.id);
          const moduleActions: ActionItem[] = [
            {
              label: module.status === "published" ? "Снять с публикации" : "Опубликовать",
              onClick: () => publishToggleModule(module),
            },
            {
              label: "Добавить главу",
              onClick: () => {
                void addChapter(module);
                if (!isExpanded) toggleModule(module.id);
              },
            },
            { label: "Удалить модуль", onClick: () => removeModule(module), danger: true },
          ];
          return (
            <li key={module.id} role="treeitem" aria-expanded={isExpanded}>
              <TreeRow
                depth={0}
                expandable={module.chapters.length > 0}
                expanded={isExpanded}
                onToggle={() => toggleModule(module.id)}
                onSelect={() => onSelect({ kind: "module", id: module.id })}
                active={selection.kind === "module" && selection.id === module.id}
                icon={<FolderOpen size={16} />}
                status={module.status}
                title={module.title}
                meta={`${module.isInDevelopment ? "В разработке · " : ""}${
                  LEARNING_ACCESS_LEVEL_LABELS[module.accessLevel]
                } · ${module.chapters.length} ${pluralize(module.chapters.length, "глава", "главы", "глав")}`}
                actions={moduleActions}
              />
              {isExpanded ? (
                <ul className="tree-children" role="group">
                  {module.chapters.map((chapter, chapterIndex) => {
                    const chapterExpanded = expandedChapters.has(chapter.id);
                    const chapterActions: ActionItem[] = [
                      {
                        label: "Выше",
                        onClick: () => moveChapter(module, chapter, -1),
                        disabled: chapterIndex === 0,
                      },
                      {
                        label: "Ниже",
                        onClick: () => moveChapter(module, chapter, 1),
                        disabled: chapterIndex === module.chapters.length - 1,
                      },
                      {
                        label: "Добавить урок",
                        onClick: () => {
                          void addLesson(chapter);
                          if (!chapterExpanded) toggleChapter(chapter.id);
                        },
                      },
                      { label: "Удалить главу", onClick: () => removeChapter(chapter), danger: true },
                    ];
                    return (
                      <li key={chapter.id} role="treeitem" aria-expanded={chapterExpanded}>
                        <TreeRow
                          depth={1}
                          expandable={chapter.lessons.length > 0}
                          expanded={chapterExpanded}
                          onToggle={() => toggleChapter(chapter.id)}
                          onSelect={() => onSelect({ kind: "chapter", id: chapter.id })}
                          active={selection.kind === "chapter" && selection.id === chapter.id}
                          icon={<BookOpen size={16} />}
                          title={chapter.title}
                          meta={`${chapter.lessons.length} ${pluralize(chapter.lessons.length, "урок", "урока", "уроков")}`}
                          actions={chapterActions}
                        />
                        {chapterExpanded ? (
                          <ul className="tree-children" role="group">
                            {chapter.lessons.map((lesson, lessonIndex) => {
                              const lessonActions: ActionItem[] = [
                                {
                                  label: "Выше",
                                  onClick: () => moveLesson(chapter, lesson, -1),
                                  disabled: lessonIndex === 0,
                                },
                                {
                                  label: "Ниже",
                                  onClick: () => moveLesson(chapter, lesson, 1),
                                  disabled: lessonIndex === chapter.lessons.length - 1,
                                },
                                {
                                  label: lesson.status === "published" ? "Снять с публикации" : "Опубликовать",
                                  onClick: () => publishToggleLesson(lesson),
                                },
                                { label: "Удалить урок", onClick: () => removeLesson(lesson), danger: true },
                              ];
                              return (
                                <li key={lesson.id} role="treeitem">
                                  <TreeRow
                                    depth={2}
                                    onSelect={() => onSelect({ kind: "lesson", id: lesson.id })}
                                    active={selection.kind === "lesson" && selection.id === lesson.id}
                                    icon={<FileText size={16} />}
                                    status={lesson.status}
                                    title={lesson.title}
                                    meta={`${lesson.blocks.length} ${pluralize(lesson.blocks.length, "блок", "блока", "блоков")} · ${lesson.attachments.length} ${pluralize(lesson.attachments.length, "файл", "файла", "файлов")}`}
                                    actions={lessonActions}
                                  />
                                </li>
                              );
                            })}
                            <li className="tree-add-row">
                              <button type="button" className="tree-add-button" onClick={() => addLesson(chapter)}>
                                <Plus size={14} /> Урок
                              </button>
                            </li>
                          </ul>
                        ) : null}
                      </li>
                    );
                  })}
                  <li className="tree-add-row">
                    <button type="button" className="tree-add-button" onClick={() => addChapter(module)}>
                      <Plus size={14} /> Глава
                    </button>
                  </li>
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function ModuleCreateForm({
  onMutate,
  onClose,
}: {
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({
    title: "",
    summary: "",
    description: "",
    coverImageId: "",
    accessLevel: "basic" as LearningModule["accessLevel"],
    isInDevelopment: false,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await onMutate("/admin/content/education/modules", "POST", {
      title: draft.title,
      summary: draft.summary,
      description: draft.description,
      coverImageId: draft.coverImageId.trim() || undefined,
      accessLevel: draft.accessLevel,
      isInDevelopment: draft.isInDevelopment,
      preview: { promotionalDescription: draft.summary, whatYouWillLearn: [] },
      chapters: [],
    });
    if (ok) onClose();
  }

  return (
    <form className="card form news-form" onSubmit={submit}>
      <div className="news-form-head">
        <span className="news-form-mode">Новый модуль</span>
      </div>
      <div className="news-form-preview">
        <FileUploadField
          accept="image/*"
          buttonLabel="Загрузить обложку"
          imagePreset="cover"
          label="Обложка модуля"
          value={draft.coverImageId}
          onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
        />
      </div>
      <label className="form-field news-content-field">
        <span>Название</span>
        <input
          className="news-form-title"
          placeholder="Название модуля…"
          onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          required
          value={draft.title}
        />
      </label>
      <label className="form-field news-content-field">
        <span>Краткое описание</span>
        <input
          className="news-form-lead"
          placeholder="Краткое описание"
          onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))}
          required
          value={draft.summary}
        />
      </label>
      <label className="form-field news-content-field">
        <span>Полное описание</span>
        <input
          className="news-form-lead"
          placeholder="Полное описание"
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
          required
          value={draft.description}
        />
      </label>
      <label className="form-field news-content-field">
        <span>Уровень доступа</span>
        <select
          className="select"
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              accessLevel: event.target.value as LearningModule["accessLevel"],
            }))
          }
          value={draft.accessLevel}
        >
          <option value="basic">{LEARNING_ACCESS_LEVEL_LABELS.basic}</option>
          <option value="extended">{LEARNING_ACCESS_LEVEL_LABELS.extended}</option>
          <option value="one_time">{LEARNING_ACCESS_LEVEL_LABELS.one_time}</option>
        </select>
      </label>
      <label className="module-development-toggle">
        <input
          checked={draft.isInDevelopment}
          onChange={(event) => setDraft((prev) => ({ ...prev, isInDevelopment: event.target.checked }))}
          type="checkbox"
        />
        <span className="module-development-toggle-track" aria-hidden="true" />
        <span>В разработке</span>
      </label>
      <button className="button" type="submit">
        Создать модуль
      </button>
    </form>
  );
}

function TreeRow({
  depth,
  expandable,
  expanded,
  onToggle,
  onSelect,
  active,
  icon,
  status,
  title,
  meta,
  actions,
}: {
  depth: number;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  active: boolean;
  icon: React.ReactNode;
  status?: "draft" | "published";
  title: string;
  meta?: string;
  actions: ActionItem[];
}) {
  return (
    <div className={`tree-row depth-${depth}${active ? " is-active" : ""}`}>
      <button
        type="button"
        className="tree-row-chevron"
        onClick={(event) => {
          event.stopPropagation();
          if (onToggle) onToggle();
        }}
        aria-label={expanded ? "Свернуть" : "Развернуть"}
        disabled={!expandable}
      >
        {expandable ? <ChevronRight size={14} className={expanded ? "is-expanded" : ""} /> : null}
      </button>
      <button type="button" className="tree-row-main" onClick={onSelect}>
        <span className="tree-row-icon">{icon}</span>
        {status ? (
          <span
            className={`tree-row-dot${status === "published" ? " is-published" : ""}`}
            title={CONTENT_STATUS_LABELS[status]}
            aria-hidden
          />
        ) : null}
        <span className="tree-row-title">{title}</span>
        {meta ? <span className="tree-row-meta">{meta}</span> : null}
      </button>
      <RowKebab actions={actions} />
    </div>
  );
}

function pluralize(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function DetailPanel({
  selection,
  modules,
  onSelect,
  onMutate,
}: {
  selection: Selection;
  modules: LearningModule[];
  onSelect: (s: Selection) => void;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  if (selection.kind === "none") {
    return <p className="page-subtitle">Выберите модуль, главу или урок слева.</p>;
  }
  if (selection.kind === "module") {
    const module = modules.find((m) => m.id === selection.id);
    if (!module) return <p className="page-subtitle">Модуль не найден.</p>;
    return <ModuleForm module={module} onMutate={onMutate} />;
  }
  if (selection.kind === "chapter") {
    const chapter = findChapter(modules, selection.id);
    if (!chapter) return <p className="page-subtitle">Глава не найдена.</p>;
    return <ChapterForm chapter={chapter} onMutate={onMutate} />;
  }
  const lesson = findLesson(modules, selection.id);
  if (!lesson) return <p className="page-subtitle">Урок не найден.</p>;
  const chapter = findChapter(modules, lesson.chapterId);
  return (
    <LessonForm
      key={lesson.id}
      lesson={lesson}
      moduleId={chapter?.moduleId ?? null}
      onMutate={onMutate}
      onSelect={onSelect}
    />
  );
}

function ModuleForm({
  module,
  onMutate,
}: {
  module: LearningModule;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState({
    title: module.title,
    summary: module.summary,
    description: module.description,
    coverImageId: module.coverImageId ?? "",
    accessLevel: module.accessLevel,
    oneTimePrice: module.oneTimePrice ?? 0,
    isInDevelopment: module.isInDevelopment,
    promotionalDescription: module.preview?.promotionalDescription ?? "",
    whatYouWillLearn: module.preview?.whatYouWillLearn ?? [],
  });
  const [bullet, setBullet] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      title: module.title,
      summary: module.summary,
      description: module.description,
      coverImageId: module.coverImageId ?? "",
      accessLevel: module.accessLevel,
      oneTimePrice: module.oneTimePrice ?? 0,
      isInDevelopment: module.isInDevelopment,
      promotionalDescription: module.preview?.promotionalDescription ?? "",
      whatYouWillLearn: module.preview?.whatYouWillLearn ?? [],
    });
  }, [
    module.id,
    module.title,
    module.summary,
    module.description,
    module.coverImageId,
    module.accessLevel,
    module.oneTimePrice,
    module.isInDevelopment,
    module.preview,
  ]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onMutate(`/admin/content/education/modules/${module.id}`, "PATCH", {
      title: draft.title,
      summary: draft.summary,
      description: draft.description,
      coverImageId: draft.coverImageId.trim() || null,
      accessLevel: draft.accessLevel,
      oneTimePrice: draft.accessLevel === "one_time" && draft.oneTimePrice > 0 ? draft.oneTimePrice : null,
      isInDevelopment: draft.isInDevelopment,
      preview: {
        promotionalDescription: draft.promotionalDescription,
        whatYouWillLearn: draft.whatYouWillLearn,
      },
    });
    setSaving(false);
  }

  return (
    <form className="form news-form" onSubmit={submit}>
      <header className="module-form-header">
        <span className="news-form-mode">Модуль</span>
        <div className="module-form-controls">
          <div className="module-access-segment" role="radiogroup" aria-label="Уровень доступа">
            {MODULE_ACCESS_OPTIONS.map((accessLevel) => (
              <label className="module-access-option" key={accessLevel}>
                <input
                  type="radio"
                  name={`module-access-${module.id}`}
                  value={accessLevel}
                  checked={draft.accessLevel === accessLevel}
                  onChange={() => setDraft((prev) => ({ ...prev, accessLevel }))}
                />
                <span>{LEARNING_ACCESS_LEVEL_LABELS[accessLevel]}</span>
              </label>
            ))}
          </div>
          <label className="module-development-toggle">
            <input
              checked={draft.isInDevelopment}
              onChange={(event) => setDraft((prev) => ({ ...prev, isInDevelopment: event.target.checked }))}
              type="checkbox"
            />
            <span className="module-development-toggle-track" aria-hidden="true" />
            <span>В разработке</span>
          </label>
        </div>
      </header>
      <div className="news-form-preview">
        <FileUploadField
          accept="image/*"
          buttonLabel={draft.coverImageId ? "Заменить обложку" : "Загрузить обложку"}
          imagePreset="cover"
          label="Обложка модуля"
          value={draft.coverImageId}
          onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
        />
      </div>
      <label className="form-field news-content-field">
        <span>Название</span>
        <input
          className="news-form-title"
          placeholder="Название модуля…"
          value={draft.title}
          onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          required
        />
      </label>
      <label className="form-field news-content-field">
        <span>Краткое описание</span>
        <input
          className="news-form-lead"
          placeholder="Краткое описание"
          value={draft.summary}
          onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))}
          required
        />
      </label>
      <label className="form-field news-content-field">
        <span>Описание для превью (доступно без подписки)</span>
        <input
          className="news-form-lead"
          placeholder="Описание для превью"
          value={draft.promotionalDescription}
          onChange={(event) => setDraft((prev) => ({ ...prev, promotionalDescription: event.target.value }))}
          required
        />
      </label>
      <label className="form-field news-content-field">
        <span>Полное описание</span>
        <input
          className="news-form-lead"
          placeholder="Полное описание"
          value={draft.description}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
          required
        />
      </label>
      {draft.accessLevel === "one_time" ? (
        <label className="form-field news-content-field">
          <span>Цена разовой покупки (рубли)</span>
          <input
            className="input"
            type="number"
            min={1}
            value={draft.oneTimePrice}
            onChange={(event) => setDraft((prev) => ({ ...prev, oneTimePrice: Number(event.target.value) }))}
          />
        </label>
      ) : null}
      <div className="form-field news-content-field">
        <span>Что узнает пользователь</span>
        <div className="stack-list">
          {draft.whatYouWillLearn.map((bulletItem, index) => (
            <div className="list-row" key={index}>
              <input
                className="input"
                value={bulletItem}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    whatYouWillLearn: prev.whatYouWillLearn.map((item, idx) =>
                      idx === index ? event.target.value : item,
                    ),
                  }))
                }
                style={{ flex: 1 }}
              />
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    whatYouWillLearn: prev.whatYouWillLearn.filter((_, idx) => idx !== index),
                  }))
                }
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
        <div className="list-row">
          <input
            className="input"
            placeholder="Новый пункт"
            value={bullet}
            onChange={(event) => setBullet(event.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              if (!bullet.trim()) return;
              setDraft((prev) => ({
                ...prev,
                whatYouWillLearn: [...prev.whatYouWillLearn, bullet.trim()],
              }));
              setBullet("");
            }}
          >
            + Пункт
          </button>
        </div>
      </div>
      <button className="button" type="submit" disabled={saving}>
        {saving ? "Сохраняю…" : "Сохранить модуль"}
      </button>
    </form>
  );
}

function ChapterForm({
  chapter,
  onMutate,
}: {
  chapter: Chapter;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(chapter.title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(chapter.title);
  }, [chapter.id, chapter.title]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onMutate(`/admin/content/education/chapters/${chapter.id}`, "PATCH", { title });
    setSaving(false);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>Глава</h2>
      <label className="form-field">
        <span>Название</span>
        <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <p className="page-subtitle">Порядок глав меняется стрелками ↑↓ в списке слева.</p>
      <button className="button" type="submit" disabled={saving}>
        {saving ? "Сохраняю…" : "Сохранить главу"}
      </button>
    </form>
  );
}

function LessonForm({
  lesson,
  moduleId,
  onMutate,
  onSelect,
}: {
  lesson: Lesson;
  moduleId: string | null;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
  onSelect: (s: Selection) => void;
}) {
  const [draft, setDraft] = useState<LessonDraft>(() => lessonToDraft(lesson));
  const [savedDraft, setSavedDraft] = useState(() => normalizeLessonDraft(lessonToDraft(lesson)));
  const [attachmentsBlockVisible, setAttachmentsBlockVisible] = useState(lesson.attachments.length > 0);
  const [saving, setSaving] = useState(false);
  const normalizedDraftAttachments = useMemo(() => normalizeAttachments(draft.attachments), [draft.attachments]);
  const normalizedDraft = useMemo(
    () => ({
      title: draft.title,
      blocks: draft.blocks.map((block) => ({ type: block.type, payload: block.payload })),
      attachments: normalizedDraftAttachments,
    }),
    [draft.blocks, draft.title, normalizedDraftAttachments],
  );

  // Черновик пересинхронизируем только при переключении на другой урок, а
  // "последнюю сохранённую версию" обновляем на каждый refetch. Так refetch
  // после автосейва не затирает текст, набранный во время сохранения, но
  // индикатор "Не сохранено" честно гаснет, когда сервер вернул ровно текущий
  // черновик.
  const loadedLessonIdRef = useRef(lesson.id);
  useEffect(() => {
    const nextSavedDraft = normalizeLessonDraft(lessonToDraft(lesson));
    setSavedDraft(nextSavedDraft);
    if (loadedLessonIdRef.current === lesson.id) return;
    loadedLessonIdRef.current = lesson.id;
    setDraft(lessonToDraft(lesson));
    setAttachmentsBlockVisible(lesson.attachments.length > 0);
  }, [lesson]);

  const persistLessonDraft = useCallback(async () => {
    const savedSnapshot = normalizedDraft;
    const ok = await onMutate(`/admin/content/education/lessons/${lesson.id}`, "PATCH", {
      title: savedSnapshot.title,
      blocks: savedSnapshot.blocks,
      attachments: savedSnapshot.attachments,
    });
    if (!ok) throw new Error("Не удалось сохранить урок.");
    setSavedDraft(savedSnapshot);
  }, [lesson.id, normalizedDraft, onMutate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await persistLessonDraft().catch(() => undefined);
    setSaving(false);
  }

  function addAttachment() {
    setDraft((prev) => ({
      ...prev,
      attachments: [...prev.attachments, { fileId: "", displayName: "" }],
    }));
  }
  function addAttachmentsBlock() {
    setAttachmentsBlockVisible(true);
    if (draft.attachments.length === 0) {
      addAttachment();
    }
  }
  function updateAttachment(index: number, patch: Partial<Attachment>) {
    setDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.map((a, idx) => (idx === index ? { ...a, ...patch } : a)),
    }));
  }
  function removeAttachment(index: number) {
    setDraft((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, idx) => idx !== index),
    }));
    if (draft.attachments.length <= 1) {
      setAttachmentsBlockVisible(false);
    }
  }

  async function publishToggle() {
    // Сначала сохраняем текущий черновик: иначе на сайт уйдёт последняя
    // автосохранённая версия, а свежие правки (которые ещё не успел подхватить
    // автосейв) потеряются. Именно из-за этого «публикую — теряю 5 минут».
    if (hasChanges) {
      setSaving(true);
      const saved = await persistLessonDraft()
        .then(() => true)
        .catch(() => false);
      setSaving(false);
      if (!saved) return;
    }
    const path =
      lesson.status === "published"
        ? `/admin/content/education/lessons/${lesson.id}/unpublish`
        : `/admin/content/education/lessons/${lesson.id}/publish`;
    await onMutate(path, "POST");
  }

  // Сравниваем draft с последней сохранённой версией, чтобы refetch после
  // сохранения не залипал в состоянии "Не сохранено".
  const hasChanges = useMemo(() => {
    if (normalizedDraft.title !== savedDraft.title) return true;
    if (JSON.stringify(normalizedDraft.blocks) !== JSON.stringify(savedDraft.blocks)) return true;
    if (JSON.stringify(normalizedDraft.attachments) !== JSON.stringify(savedDraft.attachments)) return true;
    return false;
  }, [normalizedDraft, savedDraft]);

  const lessonAutosave = useCmsAutosave({
    enabled: canAutosaveDraft(lesson.status, lesson.id) && !saving,
    hasChanges,
    onSave: persistLessonDraft,
  });
  const saveStatusClass =
    lessonAutosave.autosaveState === "dirty" ? "has-changes" : `is-${lessonAutosave.autosaveState}`;

  useUnsavedChangesWarning(hasChanges);

  return (
    <form className="form lesson-form" onSubmit={submit} onBlur={lessonAutosave.handleAutosaveBlur}>
      <header className="lesson-header">
        <span className={`lesson-header-status${lesson.status === "published" ? " is-published" : ""}`}>
          {CONTENT_STATUS_LABELS[lesson.status]}
        </span>
        <input
          className="lesson-title-input"
          value={draft.title}
          placeholder="Название урока"
          onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          required
        />
      </header>

      <section className="lesson-section">
        <h3 className="lesson-section-title">Содержание</h3>
        <DocumentEditor
          blocks={draft.blocks}
          onChange={(blocks) => setDraft((prev) => ({ ...prev, blocks: blocks as Block[] }))}
          allowedAtomicKinds={LESSON_ATOMIC_KINDS}
          placeholder="Текст урока — пишите или нажмите «/» для вставки блока…"
        />
        {!attachmentsBlockVisible ? (
          <button type="button" className="button secondary lesson-attach-reveal" onClick={addAttachmentsBlock}>
            <Paperclip size={14} /> Прикреплённые файлы
          </button>
        ) : null}
      </section>

      {attachmentsBlockVisible ? (
        <section className="lesson-section">
          <h3 className="lesson-section-title">Прикреплённые файлы</h3>
          <div className="attachments">
            <ul className="attachments-list">
              {draft.attachments.map((attachment, index) => (
                <li className="attachment-row" key={index}>
                  <Paperclip size={16} className="attachment-icon" />
                  <div className="attachment-fields">
                    <FileUploadField
                      buttonLabel={attachment.fileId ? "Заменить файл" : "Загрузить файл"}
                      hideLabel
                      compact
                      // Вложения уроков — приватные: уходят в приватный бакет и
                      // отдаются ученику только presigned-ссылкой за paywall.
                      accessLevel="authenticated"
                      value={attachment.fileId}
                      onChange={(fileId, asset) =>
                        updateAttachment(index, {
                          fileId,
                          displayName: attachment.displayName || asset?.originalName || "",
                        })
                      }
                    />
                    <input
                      className="attachment-name-input"
                      placeholder="Отображаемое имя"
                      value={attachment.displayName}
                      onChange={(event) => updateAttachment(index, { displayName: event.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    className="attachment-delete"
                    onClick={() => removeAttachment(index)}
                    title="Удалить файл"
                    aria-label="Удалить файл"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="attachments-add" onClick={addAttachment}>
              <Plus size={14} /> Добавить файл
            </button>
          </div>
        </section>
      ) : null}

      <div className="lesson-save-bar news-save-bar">
        <span className={`lesson-save-bar-status ${saveStatusClass}`}>
          {saving ? "Сохраняется…" : lessonAutosave.autosaveLabel}
        </span>
        <div className="lesson-save-bar-actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => onSelect({ kind: "chapter", id: lesson.chapterId })}
          >
            К главе
          </button>
          <button className="button secondary" type="button" onClick={publishToggle}>
            {lesson.status === "published" ? "Снять с публикации" : "Опубликовать"}
          </button>
          {moduleId && !hasChanges ? (
            <a
              className="button secondary"
              href={`/education/${encodeURIComponent(moduleId)}/${encodeURIComponent(lesson.id)}?preview=1`}
              target="_blank"
              rel="noreferrer"
              title="Открыть публичный предпросмотр"
            >
              <ExternalLink size={14} />
              Предпросмотр
            </a>
          ) : (
            <button
              className="button secondary"
              type="button"
              disabled
              title={!moduleId ? "Модуль не найден" : "Сначала сохраните урок, чтобы открыть публичный предпросмотр"}
            >
              <ExternalLink size={14} />
              Предпросмотр
            </button>
          )}
          <button className="button" type="submit" disabled={saving || lessonAutosave.isAutosaving || !hasChanges}>
            {saving || lessonAutosave.isAutosaving ? "Сохраняется…" : "Сохранить"}
          </button>
        </div>
      </div>
    </form>
  );
}

function findChapter(modules: LearningModule[], chapterId: string): Chapter | null {
  for (const module of modules) {
    const chapter = module.chapters.find((c) => c.id === chapterId);
    if (chapter) return chapter;
  }
  return null;
}

function findLesson(modules: LearningModule[], lessonId: string): Lesson | null {
  for (const module of modules) {
    for (const chapter of module.chapters) {
      const lesson = chapter.lessons.find((l) => l.id === lessonId);
      if (lesson) return lesson;
    }
  }
  return null;
}
