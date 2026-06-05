"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, ChevronRight, FileText, FolderOpen, Plus } from "lucide-react";
import { RowKebab, type ActionItem } from "../../../components/RowKebab";
import { CONTENT_STATUS_LABELS, LEARNING_ACCESS_LEVEL_LABELS } from "../../../lib/display-labels";
import { pluralizeRu } from "../../../lib/ru-plural";
import { ModuleCreateForm } from "./module-create-form";
import type { Chapter, EducationMutation, LearningModule, Lesson, Selection, SetEducationSelection } from "./types";
import { findChapter, findLesson } from "./utils";

export function EducationTree({
  modules,
  selection,
  onSelect,
  onMutate,
}: {
  modules: LearningModule[];
  selection: Selection;
  onSelect: SetEducationSelection;
  onMutate: EducationMutation;
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
                } · ${module.chapters.length} ${pluralizeRu(module.chapters.length, "глава", "главы", "глав")}`}
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
                          meta={`${chapter.lessons.length} ${pluralizeRu(chapter.lessons.length, "урок", "урока", "уроков")}`}
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
                                    meta={`${lesson.blocks.length} ${pluralizeRu(lesson.blocks.length, "блок", "блока", "блоков")} · ${lesson.attachments.length} ${pluralizeRu(lesson.attachments.length, "файл", "файла", "файлов")}`}
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
  icon: ReactNode;
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
