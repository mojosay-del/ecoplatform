"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { canAutosaveDraft } from "../../../lib/cms-autosave";
import { EMPTY_DOCUMENT_DRAFT } from "./constants";
import {
  buildDraftFromArticle,
  hasActiveDocumentationDraft,
  hasDocumentationDraftChanges,
} from "./documentation-draft.helpers";
import type { DocArticle, DocDraftState } from "./types";

export function useAdminDocumentationDraft({
  categories,
  documentsByCategory,
  items,
}: {
  categories: DocArticle[];
  documentsByCategory: Map<string, DocArticle[]>;
  items: DocArticle[];
}) {
  const [draft, setDraft] = useState<DocDraftState>(EMPTY_DOCUMENT_DRAFT);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);

  const original = useMemo(
    () => (draft.id ? (items.find((item) => item.id === draft.id) ?? null) : null),
    [draft.id, items],
  );
  const hasActiveDraft = hasActiveDocumentationDraft(draft);
  const isEditingNew = draft.id === null && hasActiveDraft;
  const autosaveEnabled = canAutosaveDraft(original?.status, draft.id);
  const hasChanges = useMemo(() => hasDocumentationDraftChanges(draft, original), [draft, original]);

  useEffect(() => {
    if (draft.kind === "document" && draft.parentId) {
      setExpanded((prev) => (prev.has(draft.parentId!) ? prev : new Set(prev).add(draft.parentId!)));
    }
  }, [draft.kind, draft.parentId]);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const expandCategory = useCallback((id: string) => {
    setExpanded((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  const startNewDocument = useCallback(
    (categoryId: string, nextPosition?: number) => {
      const siblings = documentsByCategory.get(categoryId) ?? [];
      setDraft({
        ...EMPTY_DOCUMENT_DRAFT,
        parentId: categoryId,
        position: nextPosition ?? siblings.length,
      });
      expandCategory(categoryId);
    },
    [documentsByCategory, expandCategory],
  );

  const startEdit = useCallback((article: DocArticle) => {
    setDraft(buildDraftFromArticle(article));
  }, []);

  const activeCategoryTitle =
    draft.kind === "document" && draft.parentId
      ? (categories.find((category) => category.id === draft.parentId)?.title ?? null)
      : null;

  return {
    activeCategoryTitle,
    autosaveEnabled,
    categoryCreateOpen,
    draft,
    expandCategory,
    expanded,
    hasActiveDraft,
    hasChanges,
    isEditingNew,
    original,
    setCategoryCreateOpen,
    setDraft,
    startEdit,
    startNewDocument,
    toggleExpand,
  };
}
