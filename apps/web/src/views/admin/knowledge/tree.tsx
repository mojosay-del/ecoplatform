"use client";

import { type CSSProperties, type ReactNode } from "react";
import { DndContext, closestCenter, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GripVertical, Plus, type LucideIcon } from "lucide-react";
import { CONTENT_STATUS_LABELS } from "../../../lib/display-labels";
import { pluralizeRu } from "../../../lib/ru-plural";
import { knowledgeDisplayIconForNode } from "../../knowledge-base-icons";
import type { Article } from "./types";

export function KnowledgeCategoryNode({
  category,
  materials,
  draftId,
  expanded,
  sensors,
  onToggle,
  onSelect,
  onAddMaterial,
  onReorder,
}: {
  category: Article;
  materials: Article[];
  draftId: string | null;
  expanded: boolean;
  sensors: ReturnType<typeof useSensors>;
  onToggle: () => void;
  onSelect: (article: Article) => void;
  onAddMaterial: () => void;
  onReorder: (event: DragEndEvent) => void;
}) {
  return (
    <li role="treeitem" aria-expanded={expanded} aria-selected={draftId === category.id}>
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
        Icon={knowledgeDisplayIconForNode(category, 0)}
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
              <li className="tree-add-row is-indent">
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
      aria-selected={active}
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
    <li role="treeitem" aria-expanded={expanded} aria-selected={false}>
      <KnowledgeTreeRow
        depth={0}
        expandable={materials.length > 0}
        expanded={expanded}
        onToggle={onToggle}
        onSelect={onToggle}
        active={false}
        title="Без категории"
        meta={`${materials.length} ${pluralizeRu(materials.length, "материал", "материала", "материалов")}`}
      />
      {expanded ? (
        <ul className="tree-children" role="group">
          {materials.map((material) => (
            <li key={material.id} role="treeitem" aria-selected={draftId === material.id}>
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
      dragHandle={dragHandle}
      Icon={knowledgeDisplayIconForNode(material, 1)}
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
        {meta ? <span className="tree-row-meta">{meta}</span> : null}
      </button>
    </div>
  );
}
