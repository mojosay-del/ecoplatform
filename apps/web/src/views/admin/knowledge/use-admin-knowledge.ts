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
import { knowledgeDisplayIconNameForNode } from "../../knowledge-base-icons";
import { EMPTY_CATEGORY_DRAFT, EMPTY_MATERIAL_DRAFT, KNOWLEDGE_CATEGORY_ICON_TYPE } from "./constants";
import type { Article, DraftKind, DraftState } from "./types";
import { isKnowledgeCategory, sortByPosition } from "./utils";

const KNOWLEDGE_LIST_PATH = "/admin/content/knowledge-base";

export function useAdminKnowledge() {
  const { token } = useAuth();
  const [draft, setDraft] = useState<DraftState>(EMPTY_MATERIAL_DRAFT);
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
  } = useApiQuery<Article[]>(
    queryKeys.admin.knowledge(),
    async () => (await apiFetch<PaginatedResponse<Article>>(`${KNOWLEDGE_LIST_PATH}?limit=200`)).items,
    [],
  );

  // Сохраняем контракт прежнего loadList(): возвращает свежий список — нужен
  // вызывающим (persist/create/submit считают позицию по актуальным items).
  const reload = useCallback(async (): Promise<Article[]> => {
    const result = await refetch();
    return result.data ?? [];
  }, [refetch]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const categories = useMemo(() => items.filter(isKnowledgeCategory).sort(sortByPosition), [items]);
  const categoryIds = useMemo(() => new Set(categories.map((category) => category.id)), [categories]);
  const materialsByCategory = useMemo(() => {
    const grouped = new Map<string, Article[]>();
    for (const category of categories) {
      grouped.set(category.id, []);
    }
    for (const item of items) {
      if (isKnowledgeCategory(item)) continue;
      if (item.parentId && grouped.has(item.parentId)) {
        grouped.get(item.parentId)!.push(item);
      }
    }
    for (const materials of grouped.values()) {
      materials.sort(sortByPosition);
    }
    return grouped;
  }, [categories, items]);
  const uncategorizedMaterials = useMemo(
    () =>
      items
        .filter((item) => !isKnowledgeCategory(item) && (!item.parentId || !categoryIds.has(item.parentId)))
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
        draft.coverImageId.trim().length > 0 ||
        draft.displayIcon !== (draft.kind === "category" ? EMPTY_CATEGORY_DRAFT : EMPTY_MATERIAL_DRAFT).displayIcon ||
        draft.blocks.length > 0
      );
    }
    if (!original) return false;
    const originalKind: DraftKind = isKnowledgeCategory(original) ? "category" : "material";
    if (draft.kind !== originalKind) return true;
    if (draft.title !== original.title) return true;
    if (draft.subtitle !== (original.subtitle ?? "")) return true;
    if (draft.position !== original.position) return true;
    if (draft.displayIcon !== knowledgeDisplayIconNameForNode(original, draft.kind === "category" ? 0 : 1)) return true;

    if (draft.kind === "category") {
      return false;
    }

    if ((draft.coverImageId || "") !== (original.coverImageId ?? "")) return true;
    if (draft.parentId !== original.parentId) return true;
    if (
      JSON.stringify(canonicalizeBlocks(draft.blocks)) !==
      JSON.stringify(canonicalizeBlocks(original.blocks.map((block) => ({ type: block.type, payload: block.payload }))))
    ) {
      return true;
    }
    return false;
  }, [draft, hasActiveDraft, original]);

  useEffect(() => {
    if (draft.kind === "material" && draft.parentId) {
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

  function startNewMaterial(categoryId: string, nextPosition?: number) {
    const siblings = materialsByCategory.get(categoryId) ?? [];
    setDraft({
      ...EMPTY_MATERIAL_DRAFT,
      parentId: categoryId,
      position: nextPosition ?? siblings.length,
    });
    setExpanded((prev) => (prev.has(categoryId) ? prev : new Set(prev).add(categoryId)));
  }

  function startEdit(article: Article) {
    const kind: DraftKind = isKnowledgeCategory(article) ? "category" : "material";
    setDraft({
      ...(kind === "category" ? EMPTY_CATEGORY_DRAFT : EMPTY_MATERIAL_DRAFT),
      kind,
      id: article.id,
      parentId: kind === "category" ? null : article.parentId,
      title: article.title,
      subtitle: article.subtitle ?? "",
      coverImageId: kind === "category" ? "" : (article.coverImageId ?? ""),
      iconType: kind === "category" ? KNOWLEDGE_CATEGORY_ICON_TYPE : (article.iconType ?? ""),
      displayIcon: knowledgeDisplayIconNameForNode(article, kind === "category" ? 0 : 1),
      position: article.position,
      blocks:
        kind === "category" ? [] : article.blocks.map((block) => ({ type: block.type, payload: { ...block.payload } })),
    });
  }

  async function createCategory(title: string) {
    if (!token) {
      setMessage("Войдите как администратор или контент-менеджер.");
      return false;
    }
    try {
      const category = await apiFetch<Article>(KNOWLEDGE_LIST_PATH, {
        method: "POST",
        token,
        body: {
          parentId: null,
          title: title.trim(),
          position: categories.length,
          iconType: KNOWLEDGE_CATEGORY_ICON_TYPE,
          displayIcon: knowledgeDisplayIconNameForNode({ title: title.trim() || "Категория" }, 0),
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
        displayIcon: knowledgeDisplayIconNameForNode(category, 0),
      });
      setMessage("Категория создана.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось создать категорию.");
      return false;
    }
  }

  const buildSaveBody = useCallback(() => {
    if (draft.kind === "category") {
      return {
        parentId: null,
        title: draft.title.trim(),
        subtitle: draft.subtitle.trim() || undefined,
        coverImageId: null,
        iconType: KNOWLEDGE_CATEGORY_ICON_TYPE,
        displayIcon: draft.displayIcon,
        position: draft.position,
        blocks: [],
      };
    }

    return {
      parentId: draft.parentId,
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || undefined,
      coverImageId: draft.coverImageId.trim() || null,
      displayIcon: draft.displayIcon,
      position: draft.position,
      blocks: draft.blocks,
    };
  }, [draft]);

  const persistKnowledgeDraft = useCallback(async () => {
    if (!token) throw new Error("Нет активной сессии.");
    if (draft.kind === "material" && !draft.parentId) {
      throw new Error("Выберите категорию для материала базы знаний.");
    }

    const body = buildSaveBody();
    let saved: Article | null = null;

    if (draft.id) {
      await apiFetch(`${KNOWLEDGE_LIST_PATH}/${draft.id}`, {
        method: "PATCH",
        token,
        body,
      });
      if (
        draft.kind === "material" &&
        original &&
        (original.parentId !== draft.parentId || original.position !== draft.position)
      ) {
        await apiFetch(`${KNOWLEDGE_LIST_PATH}/${draft.id}/move`, {
          method: "PATCH",
          token,
          body: { parentId: draft.parentId, position: draft.position },
        });
      }
    } else {
      saved = await apiFetch<Article>(KNOWLEDGE_LIST_PATH, { method: "POST", token, body });
    }

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
      const label = draft.kind === "category" ? "Категория" : "Материал";
      const result = await persistKnowledgeDraft();
      setMessage(draft.id ? `${label} обновлён.` : `${label} создан как черновик.`);
      if (wasNew && draft.kind === "material" && parentId) {
        const nextPosition = result.items.filter(
          (item) => !isKnowledgeCategory(item) && item.parentId === parentId,
        ).length;
        startNewMaterial(parentId, nextPosition);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось сохранить базу знаний.");
    } finally {
      setSubmitting(false);
    }
  }

  async function publishToggle(article: Article) {
    if (!token) return;
    if (draft.id === article.id && hasChanges) {
      try {
        await persistKnowledgeDraft();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Не удалось сохранить перед публикацией.");
        return;
      }
    }
    const path =
      article.status === "published"
        ? `${KNOWLEDGE_LIST_PATH}/${article.id}/unpublish`
        : `${KNOWLEDGE_LIST_PATH}/${article.id}/publish`;
    const label = isKnowledgeCategory(article) ? "Категория" : "Материал";
    try {
      await apiFetch(path, { method: "POST", token });
      await reload();
      setMessage(article.status === "published" ? `${label} снят с публикации.` : `${label} опубликован.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось изменить статус.");
    }
  }

  async function remove(article: Article) {
    if (!token) return;
    const label = isKnowledgeCategory(article) ? "категорию" : "материал";
    if (
      !confirm(
        `Удалить ${label} «${article.title}»? Если есть дочерние материалы — сначала переместите или удалите их.`,
      )
    )
      return;
    try {
      await apiFetch(`${KNOWLEDGE_LIST_PATH}/${article.id}`, { method: "DELETE", token });
      await reload();
      if (draft.id === article.id) setDraft(EMPTY_MATERIAL_DRAFT);
      setMessage(isKnowledgeCategory(article) ? "Категория удалена." : "Материал удалён.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось удалить запись.");
    }
  }

  async function reorderMaterials(categoryId: string, event: DragEndEvent) {
    if (!token) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const materials = materialsByCategory.get(categoryId) ?? [];
    const from = materials.findIndex((item) => item.id === String(active.id));
    const to = materials.findIndex((item) => item.id === String(over.id));
    if (from === -1 || to === -1) return;

    const ordered = arrayMove(materials, from, to);
    const positions = new Map(ordered.map((item, position) => [item.id, position]));
    setItems((prev) =>
      prev.map((item) => (positions.has(item.id) ? { ...item, position: positions.get(item.id)! } : item)),
    );
    setDraft((prev) =>
      prev.id && positions.has(prev.id) ? { ...prev, parentId: categoryId, position: positions.get(prev.id)! } : prev,
    );

    try {
      await apiFetch(`${KNOWLEDGE_LIST_PATH}/${active.id}/move`, {
        method: "PATCH",
        token,
        body: { parentId: categoryId, position: to },
      });
      await reload();
      setMessage("Порядок материалов сохранён.");
    } catch (error) {
      await reload();
      setMessage(
        error instanceof Error
          ? `Не удалось сохранить порядок материалов: ${error.message}. Список обновлён с сервера.`
          : "Не удалось сохранить порядок материалов. Список обновлён с сервера.",
      );
    }
  }

  const knowledgeAutosave = useCmsAutosave({
    enabled: autosaveEnabled && !submitting,
    hasChanges,
    onSave: persistKnowledgeDraft,
  });

  useUnsavedChangesWarning(Boolean(draft.id) && hasChanges);

  const activeCategoryTitle =
    draft.kind === "material" && draft.parentId
      ? (categories.find((category) => category.id === draft.parentId)?.title ?? null)
      : null;

  return {
    activeCategoryTitle,
    autosaveEnabled,
    categories,
    categoryCreateOpen,
    createCategory,
    draft,
    expanded,
    hasActiveDraft,
    hasChanges,
    isEditingNew,
    knowledgeAutosave,
    materialsByCategory,
    message: message ?? errorMessage,
    original,
    publishToggle,
    remove,
    reorderMaterials,
    sensors,
    setCategoryCreateOpen,
    setDraft,
    startEdit,
    startNewMaterial,
    state,
    submit,
    submitting,
    toggleExpand,
    uncategorizedMaterials,
  };
}
