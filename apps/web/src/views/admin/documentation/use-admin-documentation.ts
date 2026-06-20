"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { canAutosaveDraft, useCmsAutosave, useUnsavedChangesWarning } from "../../../lib/cms-autosave";
import { canonicalizeBlocks } from "../../../lib/editor/serializer";
import { queryKeys } from "../../../lib/query/keys";
import { useApiQuery } from "../../shared";
import { documentationDisplayIconNameForNode } from "../../documentation-icons";
import { DOC_CATEGORY_ICON_TYPE, EMPTY_CATEGORY_DRAFT, EMPTY_DOCUMENT_DRAFT } from "./constants";
import type { DocArticle, DocDraftKind, DocDraftState } from "./types";
import { dateInputToIso, isDocCategory, isoToDateInput, sortByPosition } from "./utils";

const DOC_LIST_PATH = "/admin/content/documentation";

export function useAdminDocumentation() {
  const { token } = useAuth();
  const [draft, setDraft] = useState<DocDraftState>(EMPTY_DOCUMENT_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);
  const {
    data: items,
    setData: setItems,
    state,
    errorMessage,
    refetch,
  } = useApiQuery<DocArticle[]>(
    queryKeys.admin.documentation(),
    async () => (await apiFetch<PaginatedResponse<DocArticle>>(`${DOC_LIST_PATH}?limit=200`)).items,
    [],
  );

  // Сохраняем контракт прежнего loadList(): возвращает свежий список.
  const reload = useCallback(async (): Promise<DocArticle[]> => {
    const result = await refetch();
    return result.data ?? [];
  }, [refetch]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const categories = useMemo(() => items.filter(isDocCategory).sort(sortByPosition), [items]);
  const categoryIds = useMemo(() => new Set(categories.map((category) => category.id)), [categories]);
  const documentsByCategory = useMemo(() => {
    const grouped = new Map<string, DocArticle[]>();
    for (const category of categories) {
      grouped.set(category.id, []);
    }
    for (const item of items) {
      if (isDocCategory(item)) continue;
      if (item.parentId && grouped.has(item.parentId)) {
        grouped.get(item.parentId)!.push(item);
      }
    }
    for (const documents of grouped.values()) {
      documents.sort(sortByPosition);
    }
    return grouped;
  }, [categories, items]);
  const uncategorizedDocuments = useMemo(
    () =>
      items
        .filter((item) => !isDocCategory(item) && (!item.parentId || !categoryIds.has(item.parentId)))
        .sort(sortByPosition),
    [categoryIds, items],
  );

  const original = useMemo(
    () => (draft.id ? (items.find((item) => item.id === draft.id) ?? null) : null),
    [draft.id, items],
  );

  const hasActiveDraft = draft.id !== null || draft.parentId !== null || draft.kind === "category";
  const isEditingNew = draft.id === null && hasActiveDraft;
  const autosaveEnabled = canAutosaveDraft(original?.status, draft.id);

  const hasChanges = useMemo(() => {
    if (!hasActiveDraft) return false;
    if (!draft.id) {
      return (
        draft.title.trim().length > 0 ||
        draft.subtitle.trim().length > 0 ||
        draft.fileAssetId.trim().length > 0 ||
        draft.version.trim().length > 0 ||
        draft.effectiveDate.length > 0 ||
        (draft.kind === "category" && draft.displayIcon !== EMPTY_CATEGORY_DRAFT.displayIcon) ||
        draft.isPinned ||
        draft.blocks.length > 0
      );
    }
    if (!original) return false;
    const originalKind: DocDraftKind = isDocCategory(original) ? "category" : "document";
    if (draft.kind !== originalKind) return true;
    if (draft.title !== original.title) return true;
    if (draft.subtitle !== (original.subtitle ?? "")) return true;
    if (draft.position !== original.position) return true;

    if (draft.kind === "category") {
      return draft.displayIcon !== documentationDisplayIconNameForNode(original);
    }

    if (draft.markRevised) return true;
    if (draft.parentId !== original.parentId) return true;
    if (draft.fileAssetId !== (original.file?.id ?? "")) return true;
    if (draft.version !== (original.version ?? "")) return true;
    if (draft.effectiveDate !== isoToDateInput(original.effectiveDate)) return true;
    if (draft.isPinned !== original.isPinned) return true;
    if (
      JSON.stringify(canonicalizeBlocks(draft.blocks)) !==
      JSON.stringify(canonicalizeBlocks(original.blocks.map((block) => ({ type: block.type, payload: block.payload }))))
    ) {
      return true;
    }
    return false;
  }, [draft, hasActiveDraft, original]);

  useEffect(() => {
    if (draft.kind === "document" && draft.parentId) {
      setExpanded((prev) => (prev.has(draft.parentId!) ? prev : new Set(prev).add(draft.parentId!)));
    }
  }, [draft.kind, draft.parentId]);

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startNewDocument(categoryId: string, nextPosition?: number) {
    const siblings = documentsByCategory.get(categoryId) ?? [];
    setDraft({
      ...EMPTY_DOCUMENT_DRAFT,
      parentId: categoryId,
      position: nextPosition ?? siblings.length,
    });
    setExpanded((prev) => (prev.has(categoryId) ? prev : new Set(prev).add(categoryId)));
  }

  function startEdit(article: DocArticle) {
    const kind: DocDraftKind = isDocCategory(article) ? "category" : "document";
    setDraft({
      ...(kind === "category" ? EMPTY_CATEGORY_DRAFT : EMPTY_DOCUMENT_DRAFT),
      kind,
      id: article.id,
      parentId: kind === "category" ? null : article.parentId,
      title: article.title,
      subtitle: article.subtitle ?? "",
      iconType: kind === "category" ? DOC_CATEGORY_ICON_TYPE : (article.iconType ?? ""),
      displayIcon: kind === "category" ? documentationDisplayIconNameForNode(article) : "",
      position: article.position,
      blocks:
        kind === "category" ? [] : article.blocks.map((block) => ({ type: block.type, payload: { ...block.payload } })),
      fileAssetId: kind === "category" ? "" : (article.file?.id ?? ""),
      version: kind === "category" ? "" : (article.version ?? ""),
      effectiveDate: kind === "category" ? "" : isoToDateInput(article.effectiveDate),
      isPinned: kind === "category" ? false : article.isPinned,
      markRevised: false,
    });
  }

  async function createCategory(title: string) {
    if (!token) {
      setMessage("Войдите как администратор или контент-менеджер.");
      return false;
    }
    try {
      const category = await apiFetch<DocArticle>(DOC_LIST_PATH, {
        method: "POST",
        token,
        body: {
          parentId: null,
          title: title.trim(),
          position: categories.length,
          iconType: DOC_CATEGORY_ICON_TYPE,
          displayIcon: documentationDisplayIconNameForNode({ title: title.trim() || "Раздел" }),
          blocks: [],
        },
      });
      await reload();
      setExpanded((prev) => new Set(prev).add(category.id));
      setDraft({
        ...EMPTY_CATEGORY_DRAFT,
        id: category.id,
        title: category.title,
        position: category.position,
        displayIcon: documentationDisplayIconNameForNode(category),
      });
      setMessage("Раздел создан.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать раздел.");
      return false;
    }
  }

  const buildSaveBody = useCallback(() => {
    if (draft.kind === "category") {
      return {
        parentId: null,
        title: draft.title.trim(),
        subtitle: draft.subtitle.trim() || null,
        iconType: DOC_CATEGORY_ICON_TYPE,
        displayIcon: draft.displayIcon,
        position: draft.position,
        blocks: [],
      };
    }

    return {
      parentId: draft.parentId,
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || null,
      position: draft.position,
      displayIcon: null,
      blocks: draft.blocks,
      fileAssetId: draft.fileAssetId.trim() || null,
      version: draft.version.trim() || null,
      effectiveDate: dateInputToIso(draft.effectiveDate),
      isPinned: draft.isPinned,
      markRevised: draft.markRevised,
    };
  }, [draft]);

  const persistDocDraft = useCallback(async () => {
    if (!token) throw new Error("Нет активной сессии.");
    if (draft.kind === "document" && !draft.parentId) {
      throw new Error("Выберите раздел для документа.");
    }

    const body = buildSaveBody();
    let saved: DocArticle | null = null;

    if (draft.id) {
      await apiFetch(`${DOC_LIST_PATH}/${draft.id}`, { method: "PATCH", token, body });
      if (
        draft.kind === "document" &&
        original &&
        (original.parentId !== draft.parentId || original.position !== draft.position)
      ) {
        await apiFetch(`${DOC_LIST_PATH}/${draft.id}/move`, {
          method: "PATCH",
          token,
          body: { parentId: draft.parentId, position: draft.position },
        });
      }
    } else {
      saved = await apiFetch<DocArticle>(DOC_LIST_PATH, { method: "POST", token, body });
    }

    // markRevised — одноразовая отметка: после сохранения снимаем, чтобы автосейв
    // и повторные «Сохранить» не бампили revisedAt каждый раз.
    setDraft((prev) => (prev.markRevised ? { ...prev, markRevised: false } : prev));

    const nextItems = await reload();
    return { items: nextItems, saved };
  }, [buildSaveBody, draft.id, draft.kind, draft.parentId, draft.position, reload, original, token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const wasNew = !draft.id;
      const parentId = draft.parentId;
      const label = draft.kind === "category" ? "Раздел" : "Документ";
      const result = await persistDocDraft();
      setMessage(draft.id ? `${label} обновлён.` : `${label} создан как черновик.`);
      if (wasNew && draft.kind === "document" && parentId) {
        const nextPosition = result.items.filter((item) => !isDocCategory(item) && item.parentId === parentId).length;
        startNewDocument(parentId, nextPosition);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить документ.");
    } finally {
      setSubmitting(false);
    }
  }

  async function publishToggle(article: DocArticle) {
    if (!token) return;
    if (draft.id === article.id && hasChanges) {
      try {
        await persistDocDraft();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Не удалось сохранить перед публикацией.");
        return;
      }
    }
    const path =
      article.status === "published"
        ? `${DOC_LIST_PATH}/${article.id}/unpublish`
        : `${DOC_LIST_PATH}/${article.id}/publish`;
    const label = isDocCategory(article) ? "Раздел" : "Документ";
    try {
      await apiFetch(path, { method: "POST", token });
      await reload();
      setMessage(article.status === "published" ? `${label} снят с публикации.` : `${label} опубликован.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить статус.");
    }
  }

  async function remove(article: DocArticle) {
    if (!token) return;
    const label = isDocCategory(article) ? "раздел" : "документ";
    if (!confirm(`Удалить ${label} «${article.title}»? Если есть дочерние — сначала переместите или удалите их.`)) {
      return;
    }
    try {
      await apiFetch(`${DOC_LIST_PATH}/${article.id}`, { method: "DELETE", token });
      await reload();
      if (draft.id === article.id) setDraft(EMPTY_DOCUMENT_DRAFT);
      setMessage(isDocCategory(article) ? "Раздел удалён." : "Документ удалён.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить запись.");
    }
  }

  async function reorderDocuments(categoryId: string, event: DragEndEvent) {
    if (!token) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const documents = documentsByCategory.get(categoryId) ?? [];
    const from = documents.findIndex((item) => item.id === String(active.id));
    const to = documents.findIndex((item) => item.id === String(over.id));
    if (from === -1 || to === -1) return;

    const ordered = arrayMove(documents, from, to);
    const positions = new Map(ordered.map((item, position) => [item.id, position]));
    setItems((prev) =>
      prev.map((item) => (positions.has(item.id) ? { ...item, position: positions.get(item.id)! } : item)),
    );
    setDraft((prev) =>
      prev.id && positions.has(prev.id) ? { ...prev, parentId: categoryId, position: positions.get(prev.id)! } : prev,
    );

    try {
      await apiFetch(`${DOC_LIST_PATH}/${active.id}/move`, {
        method: "PATCH",
        token,
        body: { parentId: categoryId, position: to },
      });
      await reload();
      setMessage("Порядок документов сохранён.");
    } catch (error) {
      await reload();
      setMessage(
        error instanceof Error
          ? `Не удалось сохранить порядок: ${error.message}. Список обновлён с сервера.`
          : "Не удалось сохранить порядок документов. Список обновлён с сервера.",
      );
    }
  }

  const docAutosave = useCmsAutosave({
    enabled: autosaveEnabled && !submitting,
    hasChanges,
    onSave: persistDocDraft,
  });

  useUnsavedChangesWarning(Boolean(draft.id) && hasChanges);

  const activeCategoryTitle =
    draft.kind === "document" && draft.parentId
      ? (categories.find((category) => category.id === draft.parentId)?.title ?? null)
      : null;

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
