"use client";

// Экран CMS «Индексы цен»: слева дерево каталога (категории → номенклатура),
// справа — редактор выбранной позиции. Этот файл держит состояние и загрузку
// данных; под-компоненты вынесены в соседние модули этой папки:
//   NomenclatureRow.tsx — строка номенклатуры в дереве
//   create-forms.tsx    — инлайн-формы создания категории/номенклатуры
//   CategoryEditor.tsx  — правая панель категории
//   PriceIndexCard.tsx  — правая панель номенклатуры и истории цен
//   format.ts / types.ts — форматтеры и доменные типы

import { useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronRight, FolderOpen, Plus } from "lucide-react";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { formatPriceValuesCount } from "./format";
import { SortableNomenclatureRow } from "./NomenclatureRow";
import { CategoryCreateForm, NomenclatureCreateForm } from "./create-forms";
import { CategoryEditor } from "./CategoryEditor";
import { PriceIndexCard } from "./PriceIndexCard";
import type { Category, MutateFn, Nomenclature, Selection } from "./types";

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

  const mutate: MutateFn = async (path, method, body) => {
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
  };

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

  async function deleteCategory(category: Category) {
    if (!confirm(`Удалить категорию «${category.name}»?`)) return;
    const ok = await mutate(`/admin/content/indices/categories/${category.id}`, "DELETE");
    if (ok && selection.kind === "category" && selection.id === category.id) {
      setSelection({ kind: "none" });
    }
  }

  function openNomenclatureCreate(categoryId: string) {
    setCreateOpen({ type: "nomenclature", categoryId });
    setExpanded((prev) => (prev.has(categoryId) ? prev : new Set(prev).add(categoryId)));
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
                                  onClick={() => openNomenclatureCreate(category.id)}
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
              <CategoryEditor
                key={activeCategory.id}
                category={activeCategory}
                onMutate={mutate}
                onAddNomenclature={(category) => openNomenclatureCreate(category.id)}
                onDeleteCategory={(category) => void deleteCategory(category)}
              />
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
