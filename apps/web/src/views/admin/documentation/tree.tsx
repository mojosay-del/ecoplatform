"use client";

import { type CSSProperties, type ReactNode } from "react";
import { DndContext, closestCenter, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical, Pin, Plus, type LucideIcon } from "lucide-react";
import { CONTENT_STATUS_LABELS } from "../../../lib/display-labels";
import { pluralizeRu } from "../../../lib/ru-plural";
import { formatBytes } from "../../documentation/doc-helpers";
import { formatLabel } from "../../documentation/documentFormats";
import { documentationDisplayIconForNode } from "../../documentation-icons";
import type { DocArticle } from "./types";

function documentMeta(document: DocArticle): string {
  if (document.file) {
    return `${formatLabel(document.file.format)} · ${formatBytes(document.file.sizeBytes)}`;
  }
  return "без файла";
}

export function DocCategoryNode({
  category,
  documents,
  draftId,
  expanded,
  sensors,
  onToggle,
  onSelect,
  onAddDocument,
  onReorder,
}: {
  category: DocArticle;
  documents: DocArticle[];
  draftId: string | null;
  expanded: boolean;
  sensors: ReturnType<typeof useSensors>;
  onToggle: () => void;
  onSelect: (article: DocArticle) => void;
  onAddDocument: () => void;
  onReorder: (event: DragEndEvent) => void;
}) {
  return (
    <li role="treeitem" aria-expanded={expanded}>
      <DocTreeRow
        depth={0}
        expandable={documents.length > 0}
        expanded={expanded}
        onToggle={onToggle}
        onSelect={() => onSelect(category)}
        active={draftId === category.id}
        status={category.status}
        title={category.title}
        meta={`${documents.length} ${pluralizeRu(documents.length, "документ", "документа", "документов")}`}
        Icon={documentationDisplayIconForNode(category)}
      />
      {expanded ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onReorder}>
          <SortableContext items={documents.map((document) => document.id)} strategy={verticalListSortingStrategy}>
            <ul className="tree-children" role="group">
              {documents.map((document) => (
                <SortableDocument
                  key={document.id}
                  document={document}
                  active={draftId === document.id}
                  onSelect={onSelect}
                />
              ))}
              <li className="tree-add-row is-indent">
                <button type="button" className="tree-add-button" onClick={onAddDocument}>
                  <Plus size={14} /> Документ
                </button>
              </li>
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}
    </li>
  );
}

function SortableDocument({
  document,
  active,
  onSelect,
}: {
  document: DocArticle;
  active: boolean;
  onSelect: (article: DocArticle) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: document.id });

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
      className={isDragging ? "knowledge-sortable-item is-dragging" : "knowledge-sortable-item"}
    >
      <DocumentRow
        document={document}
        active={active}
        onSelect={onSelect}
        dragHandle={
          <button
            type="button"
            className="tree-row-drag-handle"
            aria-label="Перетащить документ"
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

export function DocUncategorizedNode({
  documents,
  draftId,
  expanded,
  onToggle,
  onSelect,
}: {
  documents: DocArticle[];
  draftId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (article: DocArticle) => void;
}) {
  return (
    <li role="treeitem" aria-expanded={expanded}>
      <DocTreeRow
        depth={0}
        expandable={documents.length > 0}
        expanded={expanded}
        onToggle={onToggle}
        onSelect={onToggle}
        active={false}
        title="Без раздела"
        meta={`${documents.length} ${pluralizeRu(documents.length, "документ", "документа", "документов")}`}
      />
      {expanded ? (
        <ul className="tree-children" role="group">
          {documents.map((document) => (
            <li key={document.id} role="treeitem">
              <DocumentRow document={document} active={draftId === document.id} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function DocumentRow({
  document,
  active,
  dragHandle,
  onSelect,
}: {
  document: DocArticle;
  active: boolean;
  dragHandle?: ReactNode;
  onSelect: (article: DocArticle) => void;
}) {
  return (
    <DocTreeRow
      depth={1}
      onSelect={() => onSelect(document)}
      active={active}
      status={document.status}
      title={document.title}
      meta={documentMeta(document)}
      pinned={document.isPinned}
      dragHandle={dragHandle}
    />
  );
}

function DocTreeRow({
  depth,
  expandable,
  expanded,
  onToggle,
  onSelect,
  active,
  status,
  title,
  meta,
  pinned,
  dragHandle,
  Icon,
}: {
  depth: number;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  onSelect: () => void;
  active: boolean;
  status?: "draft" | "published";
  title: string;
  meta?: string;
  pinned?: boolean;
  dragHandle?: ReactNode;
  Icon?: LucideIcon;
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
        disabled={!expandable}
        aria-label={expanded ? "Свернуть" : "Развернуть"}
      >
        {expandable ? <ChevronRight size={14} className={expanded ? "is-expanded" : ""} /> : null}
      </button>
      <button type="button" className="tree-row-main" onClick={onSelect}>
        {status ? (
          <span
            className={`tree-row-dot${status === "published" ? " is-published" : ""}`}
            title={CONTENT_STATUS_LABELS[status]}
            aria-hidden
          />
        ) : null}
        {Icon ? (
          <span className="tree-row-icon" aria-hidden="true">
            <Icon size={15} strokeWidth={2.1} />
          </span>
        ) : null}
        <span className="tree-row-title">{title}</span>
        {pinned ? <Pin size={12} aria-label="Закреплён" /> : null}
        {meta ? <span className="tree-row-meta">{meta}</span> : null}
      </button>
    </div>
  );
}
