"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookOpen, ChevronRight, FileText, FolderOpen, GripVertical, Plus } from "lucide-react";
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
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

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

  async function addChapter(module: LearningModule) {
    await onMutate(`/admin/content/education/modules/${module.id}/chapters`, "POST", {
      title: `Глава ${module.chapters.length + 1}`,
      position: module.chapters.length,
    });
  }

  async function addLesson(chapter: Chapter) {
    await onMutate(`/admin/content/education/chapters/${chapter.id}/lessons`, "POST", {
      title: `Урок ${chapter.lessons.length + 1}`,
      position: chapter.lessons.length,
      blocks: [],
      attachments: [],
    });
  }

  async function reorderChapters(module: LearningModule, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = module.chapters.findIndex((chapter) => chapter.id === String(active.id));
    const to = module.chapters.findIndex((chapter) => chapter.id === String(over.id));
    if (from === -1 || to === -1) return;

    await onMutate(`/admin/content/education/chapters/${active.id}`, "PATCH", {
      position: to,
    });
  }

  async function reorderLessons(chapter: Chapter, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = chapter.lessons.findIndex((lesson) => lesson.id === String(active.id));
    const to = chapter.lessons.findIndex((lesson) => lesson.id === String(over.id));
    if (from === -1 || to === -1) return;

    await onMutate(`/admin/content/education/lessons/${active.id}`, "PATCH", {
      position: to,
    });
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
          return (
            <li
              key={module.id}
              role="treeitem"
              aria-expanded={isExpanded}
              aria-selected={selection.kind === "module" && selection.id === module.id}
            >
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
              />
              {isExpanded ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => reorderChapters(module, event)}
                >
                  <SortableContext
                    items={module.chapters.map((chapter) => chapter.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul className="tree-children" role="group">
                      {module.chapters.map((chapter) => {
                        const chapterExpanded = expandedChapters.has(chapter.id);
                        return (
                          <SortableChapterNode
                            key={chapter.id}
                            chapter={chapter}
                            expanded={chapterExpanded}
                            selection={selection}
                            sensors={sensors}
                            onToggle={() => toggleChapter(chapter.id)}
                            onSelect={onSelect}
                            onAddLesson={() => addLesson(chapter)}
                            onReorderLessons={(event) => reorderLessons(chapter, event)}
                          />
                        );
                      })}
                      <li className="tree-add-row">
                        <button type="button" className="tree-add-button" onClick={() => addChapter(module)}>
                          <Plus size={14} /> Глава
                        </button>
                      </li>
                    </ul>
                  </SortableContext>
                </DndContext>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function SortableChapterNode({
  chapter,
  expanded,
  selection,
  sensors,
  onToggle,
  onSelect,
  onAddLesson,
  onReorderLessons,
}: {
  chapter: Chapter;
  expanded: boolean;
  selection: Selection;
  sensors: ReturnType<typeof useSensors>;
  onToggle: () => void;
  onSelect: SetEducationSelection;
  onAddLesson: () => void;
  onReorderLessons: (event: DragEndEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chapter.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      role="treeitem"
      aria-expanded={expanded}
      aria-selected={selection.kind === "chapter" && selection.id === chapter.id}
      className={isDragging ? "education-sortable-item is-dragging" : "education-sortable-item"}
    >
      <TreeRow
        depth={1}
        expandable={chapter.lessons.length > 0}
        expanded={expanded}
        onToggle={onToggle}
        onSelect={() => onSelect({ kind: "chapter", id: chapter.id })}
        active={selection.kind === "chapter" && selection.id === chapter.id}
        icon={<BookOpen size={16} />}
        title={chapter.title}
        meta={`${chapter.lessons.length} ${pluralizeRu(chapter.lessons.length, "урок", "урока", "уроков")}`}
        dragHandle={
          <button
            type="button"
            className="tree-row-drag-handle"
            aria-label="Перетащить главу"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>
        }
      />
      {expanded ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onReorderLessons}>
          <SortableContext items={chapter.lessons.map((lesson) => lesson.id)} strategy={verticalListSortingStrategy}>
            <ul className="tree-children" role="group">
              {chapter.lessons.map((lesson) => (
                <SortableLessonNode
                  key={lesson.id}
                  lesson={lesson}
                  active={selection.kind === "lesson" && selection.id === lesson.id}
                  onSelect={() => onSelect({ kind: "lesson", id: lesson.id })}
                />
              ))}
              <li className="tree-add-row">
                <button type="button" className="tree-add-button" onClick={onAddLesson}>
                  <Plus size={14} /> Урок
                </button>
              </li>
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}
    </li>
  );
}

function SortableLessonNode({ lesson, active, onSelect }: { lesson: Lesson; active: boolean; onSelect: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      role="treeitem"
      aria-selected={active}
      className={isDragging ? "education-sortable-item is-dragging" : "education-sortable-item"}
    >
      <TreeRow
        depth={2}
        onSelect={onSelect}
        active={active}
        icon={<FileText size={16} />}
        status={lesson.status}
        title={lesson.title}
        meta={`${lesson.blocks.length} ${pluralizeRu(lesson.blocks.length, "блок", "блока", "блоков")} · ${lesson.attachments.length} ${pluralizeRu(lesson.attachments.length, "файл", "файла", "файлов")}`}
        dragHandle={
          <button
            type="button"
            className="tree-row-drag-handle"
            aria-label="Перетащить урок"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>
        }
      />
    </li>
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
  dragHandle,
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
  dragHandle?: ReactNode;
}) {
  return (
    <div className={`tree-row depth-${depth}${active ? " is-active" : ""}${dragHandle ? " has-drag-handle" : ""}`}>
      {dragHandle ? <span className="tree-row-drag">{dragHandle}</span> : null}
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
    </div>
  );
}
