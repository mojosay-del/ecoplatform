"use client";

import { type CSSProperties, type ReactNode } from "react";
import { DndContext, closestCenter, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical, Plus } from "lucide-react";
import { RowKebab, type ActionItem } from "../../../components/RowKebab";
import { CONTENT_STATUS_LABELS } from "../../../lib/display-labels";
import { pluralizeRu } from "../../../lib/ru-plural";
import type { Article } from "./types";

export function KnowledgeCategoryNode({
  category,
  materials,
  draftId,
  expanded,
  sensors,
  onToggle,
  onSelect,
  onPublishToggle,
  onAddMaterial,
  onRemove,
  onReorder,
}: {
  category: Article;
  materials: Article[];
  draftId: string | null;
  expanded: boolean;
  sensors: ReturnType<typeof useSensors>;
  onToggle: () => void;
  onSelect: (article: Article) => void;
  onPublishToggle: (article: Article) => void;
  onAddMaterial: () => void;
  onRemove: (article: Article) => void;
  onReorder: (event: DragEndEvent) => void;
}) {
  const actions: ActionItem[] = [
    {
      label: category.status === "published" ? "Снять с публикации" : "Опубликовать",
      onClick: () => onPublishToggle(category),
    },
    {
      label: "Добавить материал",
      onClick: () => {
        onAddMaterial();
        if (!expanded) onToggle();
      },
    },
    { label: "Удалить категорию", onClick: () => onRemove(category), danger: true },
  ];

  return (
    <li role="treeitem" aria-expanded={expanded}>
      <KnowledgeTreeRow
        depth={0}
        expandable={materials.length > 0}
        expanded={expanded}
        onToggle={onToggle}
        onSelect={() => onSelect(category)}
        active={draftId === category.id}
        status={category.status}
        title={category.title}
        meta={`${materials.length} ${pluralizeRu(materials.length, "материал", "материала", "материалов")}`}
        actions={actions}
      />
      {expanded ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onReorder}>
          <SortableContext items={materials.map((material) => material.id)} strategy={verticalListSortingStrategy}>
            <ul className="tree-children" role="group">
              {materials.map((material) => (
                <SortableKnowledgeMaterial
                  key={material.id}
                  material={material}
                  active={draftId === material.id}
                  onSelect={onSelect}
                />
              ))}
              <li className="tree-add-row" style={{ paddingLeft: 44 }}>
                <button type="button" className="tree-add-button" onClick={onAddMaterial}>
                  <Plus size={14} /> Материал
                </button>
              </li>
            </ul>
          </SortableContext>
        </DndContext>
      ) : null}
    </li>
  );
}

function SortableKnowledgeMaterial({
  material,
  active,
  onSelect,
}: {
  material: Article;
  active: boolean;
  onSelect: (article: Article) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: material.id });

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
      <KnowledgeMaterialRow
        material={material}
        active={active}
        onSelect={onSelect}
        dragHandle={
          <button
            type="button"
            className="tree-row-drag-handle"
            aria-label="Перетащить материал"
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

export function KnowledgeUncategorizedNode({
  materials,
  draftId,
  expanded,
  onToggle,
  onSelect,
}: {
  materials: Article[];
  draftId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (article: Article) => void;
}) {
  return (
    <li role="treeitem" aria-expanded={expanded}>
      <KnowledgeTreeRow
        depth={0}
        expandable={materials.length > 0}
        expanded={expanded}
        onToggle={onToggle}
        onSelect={onToggle}
        active={false}
        title="Без категории"
        meta={`${materials.length} ${pluralizeRu(materials.length, "материал", "материала", "материалов")}`}
        actions={[]}
      />
      {expanded ? (
        <ul className="tree-children" role="group">
          {materials.map((material) => (
            <li key={material.id} role="treeitem">
              <KnowledgeMaterialRow material={material} active={draftId === material.id} onSelect={onSelect} />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function KnowledgeMaterialRow({
  material,
  active,
  dragHandle,
  onSelect,
}: {
  material: Article;
  active: boolean;
  dragHandle?: ReactNode;
  onSelect: (article: Article) => void;
}) {
  return (
    <KnowledgeTreeRow
      depth={1}
      onSelect={() => onSelect(material)}
      active={active}
      status={material.status}
      title={material.title}
      meta={`${material.blocks.length} ${pluralizeRu(material.blocks.length, "блок", "блока", "блоков")}`}
      actions={[]}
      dragHandle={dragHandle}
    />
  );
}

function KnowledgeTreeRow({
  depth,
  expandable,
  expanded,
  onToggle,
  onSelect,
  active,
  status,
  title,
  meta,
  actions,
  dragHandle,
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
  actions: ActionItem[];
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
        <span className="tree-row-title">{title}</span>
        {meta ? <span className="tree-row-meta">{meta}</span> : null}
      </button>
      {actions.length > 0 ? <RowKebab actions={actions} /> : <span aria-hidden />}
    </div>
  );
}
