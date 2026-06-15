"use client";

import type { ComponentProps } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { UNCATEGORIZED_GROUP_ID } from "./constants";
import { KnowledgeCategoryCreateForm } from "./create-category-form";
import { KnowledgeCategoryNode, KnowledgeUncategorizedNode } from "./tree";
import type { Article } from "./types";

type KnowledgeTreeSensors = ComponentProps<typeof KnowledgeCategoryNode>["sensors"];

export function KnowledgeTreePanel({
  categories,
  categoryCreateOpen,
  draftId,
  expanded,
  materialsByCategory,
  sensors,
  uncategorizedMaterials,
  onAddMaterial,
  onCloseCategoryCreate,
  onCreateCategory,
  onReorderMaterials,
  onSelect,
  onToggleCategoryCreate,
  onToggleExpand,
}: {
  categories: Article[];
  categoryCreateOpen: boolean;
  draftId: string | null;
  expanded: Set<string>;
  materialsByCategory: Map<string, Article[]>;
  sensors: KnowledgeTreeSensors;
  uncategorizedMaterials: Article[];
  onAddMaterial: (categoryId: string) => void;
  onCloseCategoryCreate: () => void;
  onCreateCategory: (title: string) => Promise<boolean>;
  onReorderMaterials: (categoryId: string, event: DragEndEvent) => void;
  onSelect: (article: Article) => void;
  onToggleCategoryCreate: () => void;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <div className="education-tree">
      <div className="education-tree-header">
        <span className="education-tree-title">Категории</span>
        <button
          className="education-tree-add"
          type="button"
          onClick={onToggleCategoryCreate}
          title={categoryCreateOpen ? "Скрыть форму" : "Новая категория"}
          aria-label={categoryCreateOpen ? "Скрыть форму" : "Новая категория"}
        >
          <Plus size={14} />
        </button>
      </div>
      {categoryCreateOpen ? (
        <KnowledgeCategoryCreateForm onCreate={onCreateCategory} onClose={onCloseCategoryCreate} />
      ) : null}
      {categories.length === 0 ? <p className="education-tree-empty">Категорий пока нет.</p> : null}
      <ul className="tree" role="tree">
        {categories.map((category) => (
          <KnowledgeCategoryNode
            key={category.id}
            category={category}
            materials={materialsByCategory.get(category.id) ?? []}
            draftId={draftId}
            expanded={expanded.has(category.id)}
            sensors={sensors}
            onToggle={() => onToggleExpand(category.id)}
            onSelect={onSelect}
            onAddMaterial={() => onAddMaterial(category.id)}
            onReorder={(event) => onReorderMaterials(category.id, event)}
          />
        ))}
        {uncategorizedMaterials.length > 0 ? (
          <KnowledgeUncategorizedNode
            materials={uncategorizedMaterials}
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
