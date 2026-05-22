"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronRight, FolderOpen, Package, Plus, Trash2 } from "lucide-react";
import { AppShell } from "./AppShell";
import { CmsTabs } from "./CmsTabs";
import { RowKebab, type ActionItem } from "./RowKebab";
import { apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

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

type Selection =
  | { kind: "none" }
  | { kind: "category"; id: string }
  | { kind: "nomenclature"; id: string };

export function AdminIndicesView() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "none" });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState<null | "category" | { type: "nomenclature"; categoryId: string }>(
    null,
  );

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadAll() {
    if (!token) return;
    try {
      setCategories(await apiFetch<Category[]>("/admin/content/indices", { token }));
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

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">CMS</h1>
          <p className="page-subtitle">
            Категории, номенклатура и история цен. Выберите позицию слева — справа откроется индекс.
          </p>
        </header>
        <CmsTabs />
        {message ? <p className="cms-flash">{message}</p> : null}

        <div className="moderation-layout">
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
              <CategoryCreateForm
                position={categories.length}
                onMutate={mutate}
                onClose={() => setCreateOpen(null)}
              />
            ) : null}
            {categories.length === 0 ? (
              <p className="education-tree-empty">Категорий пока нет.</p>
            ) : null}
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
                        void mutate(
                          `/admin/content/indices/categories/${category.id}`,
                          "DELETE",
                        );
                      }
                    },
                  },
                ];
                return (
                  <li
                    key={category.id}
                    role="treeitem"
                    aria-expanded={isExpanded}
                  >
                    <div
                      className={`tree-row depth-0${
                        selection.kind === "category" && selection.id === category.id
                          ? " is-active"
                          : ""
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
                        <span className="tree-row-meta">
                          {category.nomenclatures.length} позиций
                        </span>
                      </button>
                      <RowKebab actions={categoryActions} />
                    </div>
                    {isExpanded ? (
                      <ul className="tree-children" role="group">
                        {category.nomenclatures.map((nomenclature) => {
                          const hasIndex = Boolean(nomenclature.priceIndex);
                          const isPublished = nomenclature.priceIndex?.status === "published";
                          const nomActions: ActionItem[] = [
                            {
                              label: "Удалить номенклатуру",
                              danger: true,
                              onClick: () => {
                                if (
                                  confirm(`Удалить номенклатуру «${nomenclature.name}»?`)
                                ) {
                                  void mutate(
                                    `/admin/content/indices/nomenclature/${nomenclature.id}`,
                                    "DELETE",
                                  );
                                }
                              },
                            },
                          ];
                          return (
                            <li key={nomenclature.id} role="treeitem">
                              <div
                                className={`tree-row depth-1${
                                  selection.kind === "nomenclature" && selection.id === nomenclature.id
                                    ? " is-active"
                                    : ""
                                }`}
                              >
                                <button
                                  type="button"
                                  className="tree-row-chevron"
                                  disabled
                                  aria-hidden
                                />
                                <button
                                  type="button"
                                  className="tree-row-main"
                                  onClick={() =>
                                    setSelection({ kind: "nomenclature", id: nomenclature.id })
                                  }
                                >
                                  <span className="tree-row-icon">
                                    <Package size={16} />
                                  </span>
                                  {hasIndex ? (
                                    <span
                                      className={`tree-row-dot${
                                        isPublished ? " is-published" : ""
                                      }`}
                                      title={isPublished ? "Опубликован" : "Черновик"}
                                      aria-hidden
                                    />
                                  ) : (
                                    <span className="tree-row-dot is-muted" aria-hidden />
                                  )}
                                  <span className="tree-row-title">{nomenclature.name}</span>
                                  <span className="tree-row-meta">
                                    {nomenclature.code}
                                  </span>
                                </button>
                                <RowKebab actions={nomActions} />
                              </div>
                            </li>
                          );
                        })}
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
                              onClick={() =>
                                setCreateOpen({ type: "nomenclature", categoryId: category.id })
                              }
                            >
                              <Plus size={14} /> Номенклатура
                            </button>
                          </li>
                        )}
                      </ul>
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
                categories={categories}
              />
            ) : activeCategory ? (
              <CategoryEditor
                key={activeCategory.id}
                category={activeCategory}
                onMutate={mutate}
              />
            ) : (
              <div className="indices-empty-detail">
                <FolderOpen size={28} />
                <h2>Выберите категорию или номенклатуру слева</h2>
                <p>
                  Категория — для переименования и удаления. Номенклатура — для редактирования и
                  ведения истории цен.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
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
        <input
          className="input"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
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

function NomenclatureCreateForm({
  categoryId,
  onMutate,
  onClose,
}: {
  categoryId: string;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ code: "", name: "", unit: "₽/т", description: "" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.code.trim() || !draft.name.trim()) return;
    const ok = await onMutate("/admin/content/indices/nomenclature", "POST", {
      categoryId,
      code: draft.code.trim(),
      name: draft.name.trim(),
      unit: draft.unit.trim() || "₽/т",
      description: draft.description.trim() || undefined,
    });
    if (ok) onClose();
  }

  return (
    <form className="card form indices-inline-form" onSubmit={submit}>
      <label className="form-field">
        <span>Код</span>
        <input
          className="input"
          autoFocus
          placeholder="например, МКР-КРТ-001"
          value={draft.code}
          onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))}
          required
        />
      </label>
      <label className="form-field">
        <span>Название</span>
        <input
          className="input"
          value={draft.name}
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
      </label>
      <div className="form-grid-2">
        <label className="form-field">
          <span>Единица измерения</span>
          <input
            className="input"
            value={draft.unit}
            onChange={(event) => setDraft((prev) => ({ ...prev, unit: event.target.value }))}
          />
        </label>
      </div>
      <label className="form-field">
        <span>Описание (необязательно)</span>
        <textarea
          className="textarea small"
          rows={2}
          value={draft.description}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
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
      <p className="page-subtitle">
        Номенклатур в этой категории: {category.nomenclatures.length}
      </p>
      <div className="lesson-save-bar">
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
  categories,
}: {
  category: Category;
  nomenclature: Nomenclature;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
  categories: Category[];
}) {
  const [draft, setDraft] = useState({
    categoryId: nomenclature.categoryId,
    code: nomenclature.code,
    name: nomenclature.name,
    unit: nomenclature.unit,
    description: nomenclature.description ?? "",
    indexDescription: nomenclature.priceIndex?.description ?? "",
  });
  const [valueDraft, setValueDraft] = useState({ date: "", price: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft({
      categoryId: nomenclature.categoryId,
      code: nomenclature.code,
      name: nomenclature.name,
      unit: nomenclature.unit,
      description: nomenclature.description ?? "",
      indexDescription: nomenclature.priceIndex?.description ?? "",
    });
  }, [
    nomenclature.id,
    nomenclature.categoryId,
    nomenclature.code,
    nomenclature.name,
    nomenclature.unit,
    nomenclature.description,
    nomenclature.priceIndex?.description,
  ]);

  const hasChanges =
    draft.categoryId !== nomenclature.categoryId ||
    draft.code !== nomenclature.code ||
    draft.name !== nomenclature.name ||
    draft.unit !== nomenclature.unit ||
    draft.description !== (nomenclature.description ?? "") ||
    draft.indexDescription !== (nomenclature.priceIndex?.description ?? "");

  const priceIndex = nomenclature.priceIndex;
  const values = priceIndex?.values ?? [];
  const latestValue = values[values.length - 1];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onMutate(`/admin/content/indices/nomenclature/${nomenclature.id}`, "PATCH", {
      categoryId: draft.categoryId,
      code: draft.code.trim(),
      name: draft.name.trim(),
      unit: draft.unit.trim() || "₽/т",
      description: draft.description.trim() || null,
    });
    if (priceIndex && draft.indexDescription !== (priceIndex.description ?? "")) {
      // У бэка нет PATCH /indices/:id для описания — описание задаётся при создании.
      // Пропускаем тихо; в будущей итерации можно добавить отдельный endpoint.
    }
    setSaving(false);
  }

  async function createIndex() {
    await onMutate("/admin/content/indices", "POST", {
      nomenclatureId: nomenclature.id,
      description: draft.indexDescription.trim() || undefined,
    });
  }

  async function addValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!priceIndex || !valueDraft.date || !valueDraft.price) return;
    const ok = await onMutate(`/admin/content/indices/${priceIndex.id}/values`, "POST", {
      date: `${valueDraft.date}T00:00:00.000Z`,
      price: Number(valueDraft.price),
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
    <form className="form news-form" onSubmit={submit}>
      <div className="news-form-head">
        <span className="news-form-mode">
          {category.name} · {nomenclature.code}
        </span>
      </div>

      <input
        className="news-form-title"
        value={draft.name}
        onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
        required
      />

      <div className="form-grid-2">
        <label className="form-field">
          <span>Категория</span>
          <select
            className="select"
            value={draft.categoryId}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, categoryId: event.target.value }))
            }
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="form-field">
          <span>Код</span>
          <input
            className="input"
            value={draft.code}
            onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))}
            required
          />
        </label>
      </div>

      <div className="form-grid-2">
        <label className="form-field">
          <span>Единица измерения</span>
          <input
            className="input"
            value={draft.unit}
            onChange={(event) => setDraft((prev) => ({ ...prev, unit: event.target.value }))}
          />
        </label>
      </div>

      <label className="form-field">
        <span>Описание номенклатуры</span>
        <textarea
          className="textarea small"
          rows={2}
          value={draft.description}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
        />
      </label>

      {/* Сводка индекса */}
      <div className="form-field">
        <span>Индекс цен</span>
        {!priceIndex ? (
          <div className="indices-no-index">
            <p>Индекс ещё не создан. Опишите его и нажмите «Создать индекс».</p>
            <textarea
              className="textarea small"
              rows={2}
              placeholder="Служебное описание (необязательно)"
              value={draft.indexDescription}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, indexDescription: event.target.value }))
              }
            />
            <button className="button" type="button" onClick={createIndex}>
              Создать индекс
            </button>
          </div>
        ) : (
          <div className="indices-summary-card">
            <div className="indices-summary-grid">
              <div>
                <span>Статус</span>
                <strong>{priceIndex.status === "published" ? "Опубликован" : "Черновик"}</strong>
              </div>
              <div>
                <span>Значений</span>
                <strong>{values.length}</strong>
              </div>
              <div>
                <span>Последнее</span>
                <strong>
                  {latestValue
                    ? `${Number(latestValue.price).toLocaleString("ru-RU")} ${nomenclature.unit}`
                    : "—"}
                </strong>
              </div>
            </div>

            <div className="indices-values-section">
              <h3 className="indices-values-title">История цен</h3>
              {values.length === 0 ? (
                <p className="page-subtitle">Значений пока нет — добавьте первое ниже.</p>
              ) : (
                <div className="indices-values-list">
                  {values.map((value) => (
                    <div className="indices-value-row" key={value.id}>
                      <span className="indices-value-date">
                        {new Date(value.date).toLocaleDateString("ru-RU")}
                      </span>
                      <strong className="indices-value-price">
                        {Number(value.price).toLocaleString("ru-RU")} {nomenclature.unit}
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

            <form
              className="indices-value-form"
              onSubmit={(event) => {
                event.stopPropagation();
                addValue(event);
              }}
            >
              <input
                className="input"
                type="date"
                value={valueDraft.date}
                onChange={(event) =>
                  setValueDraft((prev) => ({ ...prev, date: event.target.value }))
                }
                required
              />
              <input
                className="input"
                type="number"
                min="1"
                placeholder="Цена"
                value={valueDraft.price}
                onChange={(event) =>
                  setValueDraft((prev) => ({ ...prev, price: event.target.value }))
                }
                required
              />
              <button className="button secondary" type="submit">
                <Plus size={14} /> Значение
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="lesson-save-bar">
        <span className={`lesson-save-bar-status${hasChanges ? " has-changes" : ""}`}>
          {saving ? "Сохраняю…" : hasChanges ? "Есть несохранённые изменения" : "Всё сохранено"}
        </span>
        <div className="lesson-save-bar-actions">
          {priceIndex ? (
            <>
              <button className="button secondary" type="button" onClick={removeIndex}>
                Удалить индекс
              </button>
              <button className="button secondary" type="button" onClick={publishToggle}>
                {priceIndex.status === "published" ? "Снять с публикации" : "Опубликовать"}
              </button>
            </>
          ) : null}
          <button className="button" type="submit" disabled={!hasChanges || saving}>
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </form>
  );
}
