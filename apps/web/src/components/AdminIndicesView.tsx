"use client";

import { type CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, FolderOpen, GripVertical, Package, Plus, Trash2 } from "lucide-react";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "./AppShell";
import { RowKebab, type ActionItem } from "./RowKebab";
import { StatusPill } from "./StatusPill";
import { normalizeIntegerPriceInput, parseIntegerPriceInput } from "./admin-indices-price";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";
import { CONTENT_STATUS_LABELS } from "../lib/display-labels";

type Category = {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
  nomenclatures: Nomenclature[];
};

type Nomenclature = {
  id: string;
  categoryId: string;
  code: string;
  name: string;
  unit: string;
  description: string | null;
  position: number;
  isActive: boolean;
  priceIndex: PriceIndex | null;
};

type PriceIndex = {
  id: string;
  description: string | null;
  status: "draft" | "published";
  firstPublishedAt: string | null;
  values: { id: string; date: string; price: string | number }[];
};

type Selection = { kind: "none" } | { kind: "category"; id: string } | { kind: "nomenclature"; id: string };

export function AdminIndicesView() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState<null | "category" | { type: "nomenclature"; categoryId: string }>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadAll() {
    if (!token) return;
    try {
      const data = await apiFetch<PaginatedResponse<Category>>("/admin/content/indices?limit=200", { token });
      setCategories(data.items);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось загрузить индексы");
    }
  }

  async function mutate(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) {
    if (!token) {
      setMessage("Войдите как администратор или контент-менеджер.");
      return false;
    }
    try {
      await apiFetch(path, { method, token, body });
      await loadAll();
      setMessage(null);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения.");
      return false;
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Авто-раскрытие категории при выборе номенклатуры.
  useEffect(() => {
    if (selection.kind === "nomenclature") {
      const nom = categories
        .flatMap((c) => c.nomenclatures.map((n) => ({ n, c })))
        .find(({ n }) => n.id === selection.id);
      if (nom) {
        setExpanded((prev) => {
          if (prev.has(nom.c.id)) return prev;
          const next = new Set(prev);
          next.add(nom.c.id);
          return next;
        });
      }
    }
  }, [selection, categories]);

  const activeNomenclature = useMemo(() => {
    if (selection.kind !== "nomenclature") return null;
    for (const category of categories) {
      const nom = category.nomenclatures.find((item) => item.id === selection.id);
      if (nom) return { category, nomenclature: nom };
    }
    return null;
  }, [selection, categories]);

  const activeCategory = useMemo(() => {
    if (selection.kind !== "category") return null;
    return categories.find((c) => c.id === selection.id) ?? null;
  }, [selection, categories]);

  async function deleteNomenclature(nomenclature: Nomenclature) {
    const valuesCount = nomenclature.priceIndex?.values.length ?? 0;
    const indexWarning = nomenclature.priceIndex
      ? `\n\nБудет удалён связанный индекс и ${formatPriceValuesCount(valuesCount)}.`
      : "";
    const okToDelete = confirm(
      `Удалить номенклатуру «${nomenclature.name}» полностью?${indexWarning}\n\nЭто действие нельзя отменить.`,
    );
    if (!okToDelete) return;

    const ok = await mutate(`/admin/content/indices/nomenclature/${nomenclature.id}`, "DELETE");
    if (ok && selection.kind === "nomenclature" && selection.id === nomenclature.id) {
      setSelection({ kind: "none" });
    }
  }

  async function reorderNomenclatures(categoryId: string, event: DragEndEvent) {
    if (!token) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const category = categories.find((item) => item.id === categoryId);
    const nomenclatures = category?.nomenclatures ?? [];
    const from = nomenclatures.findIndex((item) => item.id === String(active.id));
    const to = nomenclatures.findIndex((item) => item.id === String(over.id));
    if (from === -1 || to === -1) return;

    const ordered = arrayMove(nomenclatures, from, to);
    setCategories((prev) =>
      prev.map((item) =>
        item.id === categoryId
          ? { ...item, nomenclatures: ordered.map((nomenclature, position) => ({ ...nomenclature, position })) }
          : item,
      ),
    );

    try {
      await apiFetch(`/admin/content/indices/nomenclature/${active.id}/move`, {
        method: "PATCH",
        token,
        body: { categoryId, position: to },
      });
      await loadAll();
      setMessage("Порядок номенклатур сохранён.");
    } catch (error) {
      await loadAll();
      setMessage(
        error instanceof Error
          ? `Не удалось сохранить порядок номенклатур: ${error.message}. Список обновлён с сервера.`
          : "Не удалось сохранить порядок номенклатур. Список обновлён с сервера.",
      );
    }
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Индексы цен</h1>
          <p className="page-subtitle">
            Категории, номенклатура и история цен. Выберите позицию слева — справа откроется индекс.
          </p>
        </header>
        {message ? <p className="cms-flash">{message}</p> : null}

        <div className="moderation-layout cms-vertical-layout">
          <div className="education-tree">
            <div className="education-tree-header">
              <span className="education-tree-title">Каталог</span>
              <button
                className="education-tree-add"
                type="button"
                onClick={() => setCreateOpen("category")}
                title="Новая категория"
                aria-label="Новая категория"
              >
                <Plus size={14} />
              </button>
            </div>
            {createOpen === "category" ? (
              <CategoryCreateForm position={categories.length} onMutate={mutate} onClose={() => setCreateOpen(null)} />
            ) : null}
            {categories.length === 0 ? <p className="education-tree-empty">Категорий пока нет.</p> : null}
            <ul className="tree" role="tree">
              {categories.map((category) => {
                const isExpanded = expanded.has(category.id);
                const categoryActions: ActionItem[] = [
                  {
                    label: "Добавить номенклатуру",
                    onClick: () => {
                      setCreateOpen({ type: "nomenclature", categoryId: category.id });
                      if (!isExpanded) toggleExpand(category.id);
                    },
                  },
                  {
                    label: "Удалить категорию",
                    danger: true,
                    onClick: () => {
                      if (confirm(`Удалить категорию «${category.name}»?`)) {
                        void mutate(`/admin/content/indices/categories/${category.id}`, "DELETE");
                      }
                    },
                  },
                ];
                return (
                  <li key={category.id} role="treeitem" aria-expanded={isExpanded}>
                    <div
                      className={`tree-row depth-0${
                        selection.kind === "category" && selection.id === category.id ? " is-active" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="tree-row-chevron"
                        disabled={category.nomenclatures.length === 0}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleExpand(category.id);
                        }}
                        aria-label={isExpanded ? "Свернуть" : "Развернуть"}
                      >
                        {category.nomenclatures.length > 0 ? (
                          <ChevronRight size={14} className={isExpanded ? "is-expanded" : ""} />
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="tree-row-main"
                        onClick={() => setSelection({ kind: "category", id: category.id })}
                      >
                        <span className="tree-row-icon">
                          <FolderOpen size={16} />
                        </span>
                        <span className="tree-row-title">{category.name}</span>
                        <span className="tree-row-meta">{category.nomenclatures.length} позиций</span>
                      </button>
                      <RowKebab actions={categoryActions} />
                    </div>
                    {isExpanded ? (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => void reorderNomenclatures(category.id, event)}
                      >
                        <SortableContext
                          items={category.nomenclatures.map((nomenclature) => nomenclature.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <ul className="tree-children" role="group">
                            {category.nomenclatures.map((nomenclature) => (
                              <SortableNomenclatureRow
                                key={nomenclature.id}
                                nomenclature={nomenclature}
                                active={selection.kind === "nomenclature" && selection.id === nomenclature.id}
                                onSelect={() => setSelection({ kind: "nomenclature", id: nomenclature.id })}
                                onDelete={() => void deleteNomenclature(nomenclature)}
                              />
                            ))}
                            {createOpen &&
                            typeof createOpen === "object" &&
                            createOpen.type === "nomenclature" &&
                            createOpen.categoryId === category.id ? (
                              <li className="tree-add-row" style={{ paddingLeft: 44 }}>
                                <NomenclatureCreateForm
                                  categoryId={category.id}
                                  onMutate={mutate}
                                  onClose={() => setCreateOpen(null)}
                                />
                              </li>
                            ) : (
                              <li className="tree-add-row" style={{ paddingLeft: 44 }}>
                                <button
                                  type="button"
                                  className="tree-add-button"
                                  onClick={() => setCreateOpen({ type: "nomenclature", categoryId: category.id })}
                                >
                                  <Plus size={14} /> Номенклатура
                                </button>
                              </li>
                            )}
                          </ul>
                        </SortableContext>
                      </DndContext>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="moderation-detail">
            {activeNomenclature ? (
              <PriceIndexCard
                key={activeNomenclature.nomenclature.id}
                category={activeNomenclature.category}
                nomenclature={activeNomenclature.nomenclature}
                onMutate={mutate}
                onDeleteNomenclature={deleteNomenclature}
              />
            ) : activeCategory ? (
              <CategoryEditor key={activeCategory.id} category={activeCategory} onMutate={mutate} />
            ) : (
              <div className="indices-empty-detail">
                <FolderOpen size={28} />
                <h2>Выберите категорию или номенклатуру слева</h2>
                <p>
                  Категория — для переименования и удаления. Номенклатура — для редактирования и ведения истории цен.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function SortableNomenclatureRow({
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

function formatPriceValuesCount(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} значение истории цен`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} значения истории цен`;
  }
  return `${count} значений истории цен`;
}

function formatIndexPrice(value: string | number) {
  return Number(value).toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });
}

function CategoryCreateForm({
  position,
  onMutate,
  onClose,
}: {
  position: number;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    const ok = await onMutate("/admin/content/indices/categories", "POST", {
      name: name.trim(),
      position,
    });
    if (ok) {
      setName("");
      onClose();
    }
  }

  return (
    <form className="card form indices-inline-form" onSubmit={submit}>
      <label className="form-field">
        <span>Название категории</span>
        <input className="input" autoFocus value={name} onChange={(event) => setName(event.target.value)} required />
      </label>
      <div className="auth-actions">
        <button className="button" type="submit">
          Создать
        </button>
        <button className="button secondary" type="button" onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function NomenclatureCreateForm({
  categoryId,
  onMutate,
  onClose,
}: {
  categoryId: string;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ name: "", code: "" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.code.trim() || !draft.name.trim()) return;
    const ok = await onMutate("/admin/content/indices/nomenclature", "POST", {
      categoryId,
      code: draft.code.trim(),
      name: draft.name.trim(),
    });
    if (ok) onClose();
  }

  return (
    <form className="card form indices-inline-form" onSubmit={submit}>
      <label className="form-field">
        <span>Название сырья</span>
        <input
          className="input"
          autoFocus
          value={draft.name}
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
      </label>
      <label className="form-field">
        <span>Код</span>
        <input
          className="input"
          placeholder="например, МС5-Б"
          value={draft.code}
          onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))}
          required
        />
      </label>
      <div className="auth-actions">
        <button className="button" type="submit">
          Создать
        </button>
        <button className="button secondary" type="button" onClick={onClose}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function CategoryEditor({
  category,
  onMutate,
}: {
  category: Category;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState({ name: category.name, position: category.position });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({ name: category.name, position: category.position });
  }, [category.id, category.name, category.position]);

  const hasChanges = draft.name !== category.name || draft.position !== category.position;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onMutate(`/admin/content/indices/categories/${category.id}`, "PATCH", {
      name: draft.name.trim(),
      position: draft.position,
    });
    setSaving(false);
  }

  return (
    <form className="form news-form" onSubmit={submit}>
      <div className="news-form-head">
        <span className="news-form-mode">Категория</span>
      </div>
      <input
        className="news-form-title"
        value={draft.name}
        onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
        required
      />
      <label className="form-field">
        <span>Позиция</span>
        <input
          className="input"
          type="number"
          min={0}
          value={draft.position}
          onChange={(event) => setDraft((prev) => ({ ...prev, position: Number(event.target.value) }))}
        />
      </label>
      <p className="page-subtitle">Номенклатур в этой категории: {category.nomenclatures.length}</p>
      <div className="lesson-save-bar news-save-bar">
        <span className={`lesson-save-bar-status${hasChanges ? " has-changes" : ""}`}>
          {saving ? "Сохраняю…" : hasChanges ? "Есть несохранённые изменения" : "Всё сохранено"}
        </span>
        <div className="lesson-save-bar-actions">
          <button className="button" type="submit" disabled={!hasChanges || saving}>
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </form>
  );
}

function PriceIndexCard({
  category,
  nomenclature,
  onMutate,
  onDeleteNomenclature,
}: {
  category: Category;
  nomenclature: Nomenclature;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
  onDeleteNomenclature: (nomenclature: Nomenclature) => Promise<void>;
}) {
  const [draft, setDraft] = useState({
    code: nomenclature.code,
    name: nomenclature.name,
  });
  const [valueDraft, setValueDraft] = useState({ date: "", price: "" });
  const [saving, setSaving] = useState(false);
  const [creatingIndex, setCreatingIndex] = useState(false);

  useEffect(() => {
    setDraft({
      code: nomenclature.code,
      name: nomenclature.name,
    });
  }, [nomenclature.id, nomenclature.code, nomenclature.name]);

  const hasChanges = draft.code !== nomenclature.code || draft.name !== nomenclature.name;

  const priceIndex = nomenclature.priceIndex;
  const values = priceIndex?.values ?? [];
  const indexStatusLabel = priceIndex ? CONTENT_STATUS_LABELS[priceIndex.status] : "Индекс не создан";
  const indexStatusVariant = priceIndex?.status === "published" ? "success" : "neutral";

  async function saveNomenclature() {
    if (!draft.code.trim() || !draft.name.trim()) return;
    setSaving(true);
    await onMutate(`/admin/content/indices/nomenclature/${nomenclature.id}`, "PATCH", {
      code: draft.code.trim(),
      name: draft.name.trim(),
    });
    setSaving(false);
  }

  async function createIndex() {
    setCreatingIndex(true);
    try {
      await onMutate("/admin/content/indices", "POST", { nomenclatureId: nomenclature.id });
    } finally {
      setCreatingIndex(false);
    }
  }

  async function addValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!priceIndex || !valueDraft.date || !valueDraft.price) return;
    const price = parseIntegerPriceInput(valueDraft.price);
    if (price === null) return;

    const ok = await onMutate(`/admin/content/indices/${priceIndex.id}/values`, "POST", {
      date: `${valueDraft.date}T00:00:00.000Z`,
      price,
    });
    if (ok) setValueDraft({ date: "", price: "" });
  }

  async function removeValue(valueId: string) {
    if (!priceIndex) return;
    if (!confirm("Удалить это значение?")) return;
    await onMutate(`/admin/content/indices/${priceIndex.id}/values/${valueId}`, "DELETE");
  }

  async function publishToggle() {
    if (!priceIndex) return;
    const path =
      priceIndex.status === "published"
        ? `/admin/content/indices/${priceIndex.id}/unpublish`
        : `/admin/content/indices/${priceIndex.id}/publish`;
    await onMutate(path, "POST", {});
  }

  async function removeIndex() {
    if (!priceIndex) return;
    if (!confirm("Удалить индекс целиком? Это снимет все значения.")) return;
    await onMutate(`/admin/content/indices/${priceIndex.id}`, "DELETE");
  }

  return (
    <div className="form news-form indices-editor-form">
      <div className="news-form-head indices-editor-head">
        <div>
          <span className="news-form-mode">
            {category.name} · {nomenclature.code}
          </span>
        </div>
        <StatusPill variant={indexStatusVariant}>{indexStatusLabel}</StatusPill>
      </div>

      <label className="indices-title-field">
        <span>Название сырья</span>
        <input
          className="news-form-title"
          value={draft.name}
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
      </label>

      <label className="indices-title-field">
        <span>Код</span>
        <input
          className="news-form-title indices-code-title"
          value={draft.code}
          onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))}
          required
        />
      </label>

      {priceIndex ? (
        <div className="form-field indices-editor-field">
          <span>Индекс цен</span>
          <div className="indices-summary-card">
            <div className="indices-values-section">
              <h3 className="indices-values-title">История цен</h3>
              {values.length === 0 ? (
                <p className="page-subtitle">Значений пока нет — добавьте первое ниже.</p>
              ) : (
                <div className="indices-values-list">
                  {values.map((value) => (
                    <div className="indices-value-row" key={value.id}>
                      <span className="indices-value-date">{new Date(value.date).toLocaleDateString("ru-RU")}</span>
                      <strong className="indices-value-price">
                        {formatIndexPrice(value.price)} {nomenclature.unit}
                      </strong>
                      <button
                        type="button"
                        className="indices-value-delete"
                        onClick={() => removeValue(value.id)}
                        aria-label="Удалить значение"
                        title="Удалить значение"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form className="indices-value-form" onSubmit={addValue}>
              <input
                className="input"
                type="date"
                value={valueDraft.date}
                onChange={(event) => setValueDraft((prev) => ({ ...prev, date: event.target.value }))}
                required
              />
              <input
                className="input"
                type="text"
                inputMode="numeric"
                placeholder="12 300"
                value={valueDraft.price}
                onChange={(event) => {
                  const normalized = normalizeIntegerPriceInput(event.target.value);
                  if (normalized !== null) {
                    setValueDraft((prev) => ({ ...prev, price: normalized }));
                  }
                }}
                required
              />
              <button className="button secondary" type="submit">
                <Plus size={14} /> Значение
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <div className="lesson-save-bar news-save-bar">
        <span className={`lesson-save-bar-status${hasChanges ? " has-changes" : ""}`}>
          {saving ? "Сохраняю…" : hasChanges ? "Есть несохранённые изменения" : "Всё сохранено"}
        </span>
        <div className="lesson-save-bar-actions">
          <button
            className="button secondary danger"
            type="button"
            onClick={() => void onDeleteNomenclature(nomenclature)}
          >
            Удалить номенклатуру
          </button>
          {priceIndex ? (
            <>
              <button className="button secondary" type="button" onClick={removeIndex}>
                Удалить индекс
              </button>
              <button className="button secondary" type="button" onClick={publishToggle}>
                {priceIndex.status === "published" ? "Снять с публикации" : "Опубликовать"}
              </button>
            </>
          ) : (
            <button className="button secondary" type="button" disabled={creatingIndex} onClick={createIndex}>
              {creatingIndex ? "Создаю…" : "Создать индекс"}
            </button>
          )}
          <button className="button" type="button" disabled={!hasChanges || saving} onClick={saveNomenclature}>
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
