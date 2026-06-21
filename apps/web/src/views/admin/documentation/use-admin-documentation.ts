"use client";

import { useAuth } from "../../../lib/auth";
import { useAdminDocumentationActions } from "./use-admin-documentation-actions";
import { useAdminDocumentationDraft } from "./use-admin-documentation-draft";
import { useAdminDocumentationList } from "./use-admin-documentation-list";
import { useAdminDocumentationReorder } from "./use-admin-documentation-reorder";

export function useAdminDocumentation() {
  const { token } = useAuth();
  const { categories, documentsByCategory, errorMessage, items, reload, setItems, state, uncategorizedDocuments } =
    useAdminDocumentationList();
  const {
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
  } = useAdminDocumentationDraft({ categories, documentsByCategory, items });
  const { createCategory, docAutosave, message, publishToggle, remove, setMessage, submit, submitting } =
    useAdminDocumentationActions({
      autosaveEnabled,
      categories,
      draft,
      expandCategory,
      hasChanges,
      original,
      reload,
      setDraft,
      startNewDocument,
      token,
    });
  const { reorderDocuments, sensors } = useAdminDocumentationReorder({
    documentsByCategory,
    reload,
    setDraft,
    setItems,
    setMessage,
    token,
  });

  return {
    activeCategoryTitle,
    autosaveEnabled,
    categories,
    categoryCreateOpen,
    createCategory,
    docAutosave,
    documentsByCategory,
    draft,
    expanded,
    hasActiveDraft,
    hasChanges,
    isEditingNew,
    message: message ?? errorMessage,
    original,
    publishToggle,
    remove,
    reorderDocuments,
    sensors,
    setCategoryCreateOpen,
    setDraft,
    startEdit,
    startNewDocument,
    state,
    submit,
    submitting,
    toggleExpand,
    uncategorizedDocuments,
  };
}
