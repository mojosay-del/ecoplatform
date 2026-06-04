"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, FileText, FolderOpen, GripVertical, Plus } from "lucide-react";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "./AppShell";
import type { Block } from "../lib/editor/block-types";
import { DocumentEditor } from "./editor/DocumentEditor";
import type { AtomicBlockKind } from "../lib/editor/block-mapping";
import { FileUploadField } from "./FileUploadField";
import { RowKebab, type ActionItem } from "./RowKebab";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { canAutosaveDraft, useCmsAutosave, useUnsavedChangesWarning } from "../lib/cms-autosave";
import { CONTENT_STATUS_LABELS } from "../lib/display-labels";

type Article = {
  id: string;
  parentId: string | null;
  title: string;
  subtitle: string | null;
  coverImageId: string | null;
  slug: string;
  position: number;
  iconType: string | null;
  status: "draft" | "published";
  firstPublishedAt: string | null;
  blocks: Block[];
  createdAt: string;
  updatedAt: string;
};

type ViewState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";
type DraftKind = "category" | "material";

type DraftState = {
  kind: DraftKind;
  id: string | null;
  parentId: string | null;
  title: string;
  subtitle: string;
  coverImageId: string;
  iconType: string;
  position: number;
  blocks: Block[];
};

const KNOWLEDGE_CATEGORY_ICON_TYPE = "category";
const UNCATEGORIZED_GROUP_ID = "__knowledge_uncategorized__";

const EMPTY_MATERIAL_DRAFT: DraftState = {
  kind: "material",
  id: null,
  parentId: null,
  title: "",
  subtitle: "",
  coverImageId: "",
  iconType: "",
  position: 0,
  blocks: [],
};

const EMPTY_CATEGORY_DRAFT: DraftState = {
  kind: "category",
  id: null,
  parentId: null,
  title: "",
  subtitle: "",
  coverImageId: "",
  iconType: KNOWLEDGE_CATEGORY_ICON_TYPE,
  position: 0,
  blocks: [],
};

// Атомарные блоки для базы знаний — всё, кроме урок-специфичных
// (lesson_tasks/quiz/matching). Текстовые блоки всегда доступны.
const KNOWLEDGE_ATOMIC_KINDS: AtomicBlockKind[] = [
  "image",
  "gallery",
  "video",
  "audio",
  "file",
  "checklist",
  "image_checklist",
];

export function AdminKnowledgeView() {
  const { token } = useAuth();
  const [state, setState] = useState<ViewState>("unauthenticated");
  const [items, setItems] = useState<Article[]>([]);
  const [draft, setDraft] = useState<DraftState>(EMPTY_MATERIAL_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);

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
        draft.iconType.trim().length > 0 ||
        draft.blocks.length > 0
      );
    }
    if (!original) return false;
    const originalKind: DraftKind = isKnowledgeCategory(original) ? "category" : "material";
    if (draft.kind !== originalKind) return true;
    if (draft.title !== original.title) return true;
    if (draft.subtitle !== (original.subtitle ?? "")) return true;
    if (draft.position !== original.position) return true;

    if (draft.kind === "category") {
      return false;
    }

    if ((draft.coverImageId || "") !== (original.coverImageId ?? "")) return true;
    if ((draft.iconType || "") !== (original.iconType ?? "")) return true;
    if (draft.parentId !== original.parentId) return true;
    if (
      JSON.stringify(draft.blocks) !==
      JSON.stringify(original.blocks.map((block) => ({ type: block.type, payload: block.payload })))
    ) {
      return true;
    }
    return false;
  }, [draft, hasActiveDraft, original]);

  const loadList = useCallback(async (): Promise<Article[]> => {
    if (!token) {
      setState("unauthenticated");
      return [];
    }
    setState("loading");
    setMessage(null);
    try {
      const data = await apiFetch<PaginatedResponse<Article>>("/admin/content/knowledge-base?limit=200", { token });
      setItems(data.items);
      setState("ready");
      return data.items;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return [];
      }
      setState("error");
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить базу знаний");
      return [];
    }
  }, [token]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

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
      const category = await apiFetch<Article>("/admin/content/knowledge-base", {
        method: "POST",
        token,
        body: {
          parentId: null,
          title: title.trim(),
          position: categories.length,
          iconType: KNOWLEDGE_CATEGORY_ICON_TYPE,
          blocks: [],
        },
      });
      await loadList();
      setExpanded((prev) => new Set(prev).add(category.id));
      setDraft({
        ...EMPTY_CATEGORY_DRAFT,
        id: category.id,
        title: category.title,
        position: category.position,
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
        position: draft.position,
        blocks: [],
      };
    }

    return {
      parentId: draft.parentId,
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || undefined,
      coverImageId: draft.coverImageId.trim() || null,
      iconType: draft.iconType.trim() || undefined,
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
      await apiFetch(`/admin/content/knowledge-base/${draft.id}`, {
        method: "PATCH",
        token,
        body,
      });
      if (
        draft.kind === "material" &&
        original &&
        (original.parentId !== draft.parentId || original.position !== draft.position)
      ) {
        await apiFetch(`/admin/content/knowledge-base/${draft.id}/move`, {
          method: "PATCH",
          token,
          body: { parentId: draft.parentId, position: draft.position },
        });
      }
    } else {
      saved = await apiFetch<Article>("/admin/content/knowledge-base", { method: "POST", token, body });
    }

    const nextItems = await loadList();
    return { items: nextItems, saved };
  }, [buildSaveBody, draft.id, draft.kind, draft.parentId, draft.position, loadList, original, token]);

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
    // Публикуем открытый в редакторе материал с несохранёнными правками —
    // сначала сохраняем черновик, чтобы не опубликовать устаревшую версию.
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
        ? `/admin/content/knowledge-base/${article.id}/unpublish`
        : `/admin/content/knowledge-base/${article.id}/publish`;
    const label = isKnowledgeCategory(article) ? "Категория" : "Материал";
    try {
      await apiFetch(path, { method: "POST", token });
      await loadList();
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
      await apiFetch(`/admin/content/knowledge-base/${article.id}`, { method: "DELETE", token });
      await loadList();
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

    try {
      await apiFetch(`/admin/content/knowledge-base/${active.id}/move`, {
        method: "PATCH",
        token,
        body: { parentId: categoryId, position: to },
      });
      await loadList();
      setMessage("Порядок материалов сохранён.");
    } catch (error) {
      await loadList();
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

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / База знаний</h1>
          <p className="page-subtitle">Войдите как администратор или контент-менеджер.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">CMS / База знаний</h1>
          <p className="page-subtitle">Раздел доступен админу и контент-менеджеру.</p>
        </section>
      </AppShell>
    );
  }

  const saveStatusClass = autosaveEnabled
    ? `is-${knowledgeAutosave.autosaveState}`
    : hasChanges
      ? "has-changes"
      : "is-saved";
  const draftLabel = draft.kind === "category" ? "Категория" : "Материал";

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">База знаний</h1>
          <p className="page-subtitle">
            Категории и материалы базы знаний. Новые материалы добавляются внутри категории.
          </p>
        </header>
        {message ? <p className="cms-flash">{message}</p> : null}

        <div className="moderation-layout cms-vertical-layout">
          <div className="education-tree">
            <div className="education-tree-header">
              <span className="education-tree-title">Категории</span>
              <button
                className="education-tree-add"
                type="button"
                onClick={() => setCategoryCreateOpen((value) => !value)}
                title={categoryCreateOpen ? "Скрыть форму" : "Новая категория"}
                aria-label={categoryCreateOpen ? "Скрыть форму" : "Новая категория"}
              >
                <Plus size={14} />
              </button>
            </div>
            {categoryCreateOpen ? (
              <KnowledgeCategoryCreateForm onCreate={createCategory} onClose={() => setCategoryCreateOpen(false)} />
            ) : null}
            {categories.length === 0 ? <p className="education-tree-empty">Категорий пока нет.</p> : null}
            <ul className="tree" role="tree">
              {categories.map((category) => (
                <KnowledgeCategoryNode
                  key={category.id}
                  category={category}
                  materials={materialsByCategory.get(category.id) ?? []}
                  draftId={draft.id}
                  expanded={expanded.has(category.id)}
                  sensors={sensors}
                  onToggle={() => toggleExpand(category.id)}
                  onSelect={startEdit}
                  onPublishToggle={publishToggle}
                  onAddMaterial={() => startNewMaterial(category.id)}
                  onRemove={remove}
                  onReorder={(event) => void reorderMaterials(category.id, event)}
                />
              ))}
              {uncategorizedMaterials.length > 0 ? (
                <KnowledgeUncategorizedNode
                  materials={uncategorizedMaterials}
                  draftId={draft.id}
                  expanded={expanded.has(UNCATEGORIZED_GROUP_ID)}
                  onToggle={() => toggleExpand(UNCATEGORIZED_GROUP_ID)}
                  onSelect={startEdit}
                  onPublishToggle={publishToggle}
                  onRemove={remove}
                />
              ) : null}
            </ul>
          </div>

          <div className="moderation-detail">
            {hasActiveDraft ? (
              <form className="form news-form" onSubmit={submit} onBlur={knowledgeAutosave.handleAutosaveBlur}>
                <div className="news-form-head">
                  <span className="news-form-mode">
                    {isEditingNew ? `Новый ${draftLabel.toLowerCase()}` : draftLabel}
                  </span>
                </div>

                {draft.kind === "category" ? (
                  <fieldset className="form-fieldset">
                    <legend className="form-legend">Категория</legend>
                    <label className="form-field">
                      <span>Название</span>
                      <input
                        className="news-form-title"
                        placeholder="Например: «Бумага и картон»"
                        value={draft.title}
                        onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                        required
                      />
                    </label>

                    <label className="form-field">
                      <span>Короткое описание</span>
                      <input
                        className="input"
                        placeholder="Необязательно"
                        value={draft.subtitle}
                        onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                      />
                    </label>
                  </fieldset>
                ) : (
                  <>
                    <fieldset className="form-fieldset">
                      <legend className="form-legend">Основное</legend>

                      <FileUploadField
                        accept="image/*"
                        buttonLabel={draft.coverImageId ? "Заменить обложку" : "Загрузить обложку"}
                        imagePreset="cover"
                        label="Обложка материала"
                        value={draft.coverImageId}
                        onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
                      />

                      <label className="form-field">
                        <span>Заголовок</span>
                        <input
                          className="news-form-title"
                          placeholder="Например: «Как сортировать стекло»"
                          value={draft.title}
                          onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                          required
                        />
                      </label>

                      <label className="form-field">
                        <span>Подзаголовок</span>
                        <input
                          className="input"
                          placeholder="Короткое уточнение (необязательно)"
                          value={draft.subtitle}
                          onChange={(event) => setDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                        />
                      </label>
                    </fieldset>

                    <fieldset className="form-fieldset">
                      <legend className="form-legend">Размещение</legend>

                      <label className="form-field">
                        <span>Раздел</span>
                        <select
                          className="select"
                          value={draft.parentId ?? ""}
                          onChange={(event) => {
                            const nextParentId = event.target.value;
                            const nextSiblings = materialsByCategory.get(nextParentId) ?? [];
                            setDraft((prev) => ({
                              ...prev,
                              parentId: nextParentId,
                              position: prev.parentId === nextParentId ? prev.position : nextSiblings.length,
                            }));
                          }}
                          required
                        >
                          <option value="">Выберите категорию</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.title}
                            </option>
                          ))}
                        </select>
                        <small className="form-field-hint">
                          Это категория базы знаний, не справочник индексов цен.
                        </small>
                      </label>

                      <div className="form-grid-2">
                        <label className="form-field">
                          <span>Порядок в категории</span>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            value={draft.position}
                            onChange={(event) =>
                              setDraft((prev) => ({ ...prev, position: Number(event.target.value) }))
                            }
                          />
                        </label>
                        <label className="form-field">
                          <span>Иконка материала</span>
                          <input
                            className="input"
                            list="knowledge-icon-types"
                            placeholder="Например: paper"
                            value={draft.iconType}
                            onChange={(event) => setDraft((prev) => ({ ...prev, iconType: event.target.value }))}
                          />
                          <datalist id="knowledge-icon-types">
                            <option value="paper" />
                            <option value="plastic" />
                            <option value="glass" />
                            <option value="metal" />
                            <option value="rubber" />
                            <option value="electronics" />
                            <option value="textile" />
                            <option value="organic" />
                          </datalist>
                        </label>
                      </div>
                    </fieldset>

                    <fieldset className="form-fieldset">
                      <legend className="form-legend">Содержание</legend>
                      <DocumentEditor
                        blocks={draft.blocks}
                        onChange={(blocks) => setDraft((prev) => ({ ...prev, blocks: blocks as Block[] }))}
                        allowedAtomicKinds={KNOWLEDGE_ATOMIC_KINDS}
                        placeholder="Текст статьи — пишите или нажмите «/» для вставки блока…"
                      />
                    </fieldset>
                  </>
                )}

                <div className="lesson-save-bar">
                  <span className={`lesson-save-bar-status ${saveStatusClass}`}>
                    {submitting
                      ? "Сохраняется…"
                      : autosaveEnabled
                        ? knowledgeAutosave.autosaveLabel
                        : hasChanges
                          ? isEditingNew
                            ? "Новый черновик"
                            : "Есть несохранённые изменения"
                          : "Сохранено"}
                  </span>
                  <div className="lesson-save-bar-actions">
                    {!isEditingNew ? (
                      <button className="button secondary" type="button" onClick={() => setDraft(EMPTY_MATERIAL_DRAFT)}>
                        Отмена
                      </button>
                    ) : null}
                    {!isEditingNew && original ? (
                      <button className="button secondary" type="button" onClick={() => publishToggle(original)}>
                        {original.status === "published" ? "Снять с публикации" : "Опубликовать"}
                      </button>
                    ) : null}
                    <button
                      className="button"
                      type="submit"
                      disabled={submitting || knowledgeAutosave.isAutosaving || !hasChanges}
                    >
                      {submitting || knowledgeAutosave.isAutosaving
                        ? "Сохраняется…"
                        : isEditingNew
                          ? "Создать черновик"
                          : "Сохранить"}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <KnowledgeEmptyDetail categoriesCount={categories.length} />
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function KnowledgeCategoryCreateForm({
  onCreate,
  onClose,
}: {
  onCreate: (title: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const ok = await onCreate(title);
      if (ok) {
        setTitle("");
        onClose();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card form knowledge-category-create-form" onSubmit={submit}>
      <h2>Новая категория</h2>
      <label className="form-field">
        <span>Название</span>
        <input
          className="input"
          placeholder="Например: «Пластики»"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>
      <div className="lesson-save-bar-actions">
        <button className="button secondary" type="button" onClick={onClose}>
          Отмена
        </button>
        <button className="button" type="submit" disabled={saving || title.trim().length === 0}>
          {saving ? "Создаётся…" : "Создать"}
        </button>
      </div>
    </form>
  );
}

function KnowledgeCategoryNode({
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
        icon={<FolderOpen size={16} />}
        status={category.status}
        title={category.title}
        meta={`${materials.length} ${pluralize(materials.length, "материал", "материала", "материалов")}`}
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
                  onPublishToggle={onPublishToggle}
                  onRemove={onRemove}
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
  onPublishToggle,
  onRemove,
}: {
  material: Article;
  active: boolean;
  onSelect: (article: Article) => void;
  onPublishToggle: (article: Article) => void;
  onRemove: (article: Article) => void;
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
        onPublishToggle={onPublishToggle}
        onRemove={onRemove}
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

function KnowledgeUncategorizedNode({
  materials,
  draftId,
  expanded,
  onToggle,
  onSelect,
  onPublishToggle,
  onRemove,
}: {
  materials: Article[];
  draftId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (article: Article) => void;
  onPublishToggle: (article: Article) => void;
  onRemove: (article: Article) => void;
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
        icon={<FolderOpen size={16} />}
        title="Без категории"
        meta={`${materials.length} ${pluralize(materials.length, "материал", "материала", "материалов")}`}
        actions={[]}
      />
      {expanded ? (
        <ul className="tree-children" role="group">
          {materials.map((material) => (
            <li key={material.id} role="treeitem">
              <KnowledgeMaterialRow
                material={material}
                active={draftId === material.id}
                onSelect={onSelect}
                onPublishToggle={onPublishToggle}
                onRemove={onRemove}
              />
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
  onPublishToggle,
  onRemove,
}: {
  material: Article;
  active: boolean;
  dragHandle?: ReactNode;
  onSelect: (article: Article) => void;
  onPublishToggle: (article: Article) => void;
  onRemove: (article: Article) => void;
}) {
  const actions: ActionItem[] = [
    {
      label: material.status === "published" ? "Снять с публикации" : "Опубликовать",
      onClick: () => onPublishToggle(material),
    },
    { label: "Удалить материал", onClick: () => onRemove(material), danger: true },
  ];

  return (
    <KnowledgeTreeRow
      depth={1}
      onSelect={() => onSelect(material)}
      active={active}
      icon={<FileText size={16} />}
      status={material.status}
      title={material.title}
      meta={`${material.blocks.length} ${pluralize(material.blocks.length, "блок", "блока", "блоков")}`}
      actions={actions}
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
  icon,
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
  icon: ReactNode;
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
        <span className="tree-row-icon">{icon}</span>
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

function KnowledgeEmptyDetail({ categoriesCount }: { categoriesCount: number }) {
  return (
    <div className="indices-empty-detail">
      <FolderOpen size={28} />
      <h2>Выберите категорию или материал слева</h2>
      <p>
        {categoriesCount > 0
          ? "Материалы добавляются через меню категории."
          : "Сначала создайте категорию через плюс в левом дереве."}
      </p>
    </div>
  );
}

function isKnowledgeCategory(article: Article) {
  return article.iconType === KNOWLEDGE_CATEGORY_ICON_TYPE;
}

function sortByPosition(a: Article, b: Article) {
  return a.position - b.position;
}

function pluralize(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
