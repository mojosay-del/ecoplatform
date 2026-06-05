"use client";

import { type CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Package } from "lucide-react";
import { RowKebab, type ActionItem } from "../../../components/RowKebab";
import { CONTENT_STATUS_LABELS } from "../../../lib/display-labels";
import type { Nomenclature } from "./types";

// Строка номенклатуры в дереве каталога: drag-handle, индикатор статуса индекса
// и kebab-меню. Перетаскивание обслуживает dnd-kit (sortable).
export function SortableNomenclatureRow({
  nomenclature,
  active,
  onSelect,
  onDelete,
}: {
  nomenclature: Nomenclature;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: nomenclature.id,
  });
  const hasIndex = Boolean(nomenclature.priceIndex);
  const isPublished = nomenclature.priceIndex?.status === "published";
  const actions: ActionItem[] = [{ label: "Удалить номенклатуру", danger: true, onClick: onDelete }];
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
      className={isDragging ? "indices-sortable-item is-dragging" : "indices-sortable-item"}
    >
      <div className={`tree-row has-drag-handle depth-1${active ? " is-active" : ""}`}>
        <span className="tree-row-drag">
          <button
            type="button"
            className="tree-row-drag-handle"
            aria-label="Перетащить номенклатуру"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} />
          </button>
        </span>
        <button type="button" className="tree-row-chevron" disabled aria-hidden />
        <button type="button" className="tree-row-main" onClick={onSelect}>
          <span className="tree-row-icon">
            <Package size={16} />
          </span>
          {hasIndex ? (
            <span
              className={`tree-row-dot${isPublished ? " is-published" : ""}`}
              title={CONTENT_STATUS_LABELS[nomenclature.priceIndex!.status]}
              aria-hidden
            />
          ) : (
            <span className="tree-row-dot is-muted" aria-hidden />
          )}
          <span className="tree-row-title">{nomenclature.name}</span>
          <span className="tree-row-meta">{nomenclature.code}</span>
        </button>
        <RowKebab actions={actions} />
      </div>
    </li>
  );
}
