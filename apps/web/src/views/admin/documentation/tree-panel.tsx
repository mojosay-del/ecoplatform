"use client";

import type { ComponentProps } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { UNCATEGORIZED_GROUP_ID } from "./constants";
import { DocCategoryCreateForm } from "./create-category-form";
import { DocCategoryNode, DocUncategorizedNode } from "./tree";
import type { DocArticle } from "./types";

type DocTreeSensors = ComponentProps<typeof DocCategoryNode>["sensors"];

export function DocTreePanel({
  categories,
  categoryCreateOpen,
  documentsByCategory,
  draftId,
  expanded,
  sensors,
  uncategorizedDocuments,
  onAddDocument,
  onCloseCategoryCreate,
  onCreateCategory,
  onReorderDocuments,
  onSelect,
  onToggleCategoryCreate,
  onToggleExpand,
}: {
  categories: DocArticle[];
  categoryCreateOpen: boolean;
  documentsByCategory: Map<string, DocArticle[]>;
  draftId: string | null;
  expanded: Set<string>;
  sensors: DocTreeSensors;
  uncategorizedDocuments: DocArticle[];
  onAddDocument: (categoryId: string) => void;
  onCloseCategoryCreate: () => void;
  onCreateCategory: (title: string) => Promise<boolean>;
  onReorderDocuments: (categoryId: string, event: DragEndEvent) => void;
  onSelect: (article: DocArticle) => void;
  onToggleCategoryCreate: () => void;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <div className="education-tree">
      <div className="education-tree-header">
        <span className="education-tree-title">Разделы</span>
        <button
          className="education-tree-add"
          type="button"
          onClick={onToggleCategoryCreate}
          title={categoryCreateOpen ? "Скрыть форму" : "Новый раздел"}
          aria-label={categoryCreateOpen ? "Скрыть форму" : "Новый раздел"}
        >
          <Plus size={14} />
        </button>
      </div>
      {categoryCreateOpen ? (
        <DocCategoryCreateForm onCreate={onCreateCategory} onClose={onCloseCategoryCreate} />
      ) : null}
      {categories.length === 0 ? <p className="education-tree-empty">Разделов пока нет.</p> : null}
      <ul className="tree" role="tree">
        {categories.map((category) => (
          <DocCategoryNode
            key={category.id}
            category={category}
            documents={documentsByCategory.get(category.id) ?? []}
            draftId={draftId}
            expanded={expanded.has(category.id)}
            sensors={sensors}
            onToggle={() => onToggleExpand(category.id)}
            onSelect={onSelect}
            onAddDocument={() => onAddDocument(category.id)}
            onReorder={(event) => onReorderDocuments(category.id, event)}
          />
        ))}
        {uncategorizedDocuments.length > 0 ? (
          <DocUncategorizedNode
            documents={uncategorizedDocuments}
            draftId={draftId}
            expanded={expanded.has(UNCATEGORIZED_GROUP_ID)}
            onToggle={() => onToggleExpand(UNCATEGORIZED_GROUP_ID)}
            onSelect={onSelect}
          />
        ) : null}
      </ul>
    </div>
  );
}
