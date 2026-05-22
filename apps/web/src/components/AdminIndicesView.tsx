"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AppShell } from "./AppShell";
import { CmsTabs } from "./CmsTabs";
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

export function AdminIndicesView() {
  const { token } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [message, setMessage] = useState("");

  const flatNomenclatures = useMemo(
    () =>
      categories.flatMap((category) =>
        category.nomenclatures.map((item) => ({ category, nomenclature: item })),
      ),
    [categories],
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
      setMessage("Сохранено.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения.");
      return false;
    }
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">CMS</h1>
          <p className="page-subtitle">Категории, номенклатура, индексы и значения — всё в одном экране.</p>
        </header>
        <CmsTabs />
        {message ? <p className="status-pill">{message}</p> : null}
        <div className="indices-admin-layout">
          <div className="stack-list">
            <CategoriesSection categories={categories} onMutate={mutate} />
            <NomenclatureSection categories={categories} onMutate={mutate} />
            <PriceIndexCreator categories={categories} onMutate={mutate} />
          </div>
          <div className="stack-list">
            {flatNomenclatures.length === 0 ? (
              <article className="card">Сначала добавьте категории и номенклатуру слева.</article>
            ) : null}
            {flatNomenclatures.map(({ category, nomenclature }) => (
              <PriceIndexCard
                key={nomenclature.id}
                category={category}
                nomenclature={nomenclature}
                onMutate={mutate}
              />
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function CategoriesSection({
  categories,
  onMutate,
}: {
  categories: Category[];
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState({ name: "", position: 0 });

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    const ok = await onMutate("/admin/content/indices/categories", "POST", {
      name: draft.name.trim(),
      position: draft.position,
    });
    if (ok) setDraft({ name: "", position: categories.length });
  }

  return (
    <section className="card form">
      <h2>Категории</h2>
      <div className="stack-list">
        {categories.map((category) => (
          <CategoryRow key={category.id} category={category} onMutate={onMutate} />
        ))}
      </div>
      <form className="form" onSubmit={create}>
        <input
          className="input"
          placeholder="Название категории"
          value={draft.name}
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
        <input
          className="input"
          placeholder="Позиция"
          type="number"
          min={0}
          value={draft.position}
          onChange={(event) => setDraft((prev) => ({ ...prev, position: Number(event.target.value) }))}
        />
        <button className="button" type="submit">
          Добавить категорию
        </button>
      </form>
    </section>
  );
}

function CategoryRow({
  category,
  onMutate,
}: {
  category: Category;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: category.name, position: category.position });

  useEffect(() => {
    setDraft({ name: category.name, position: category.position });
  }, [category.name, category.position]);

  async function save() {
    const ok = await onMutate(`/admin/content/indices/categories/${category.id}`, "PATCH", {
      name: draft.name.trim(),
      position: draft.position,
    });
    if (ok) setEditing(false);
  }

  async function remove() {
    if (!confirm(`Удалить категорию «${category.name}»?`)) return;
    await onMutate(`/admin/content/indices/categories/${category.id}`, "DELETE");
  }

  if (!editing) {
    return (
      <div className="list-row">
        <div>
          <strong>{category.name}</strong>
          <p className="page-subtitle">
            Позиция: {category.position} · Номенклатур: {category.nomenclatures.length}
          </p>
        </div>
        <div className="auth-actions">
          <button className="button secondary" type="button" onClick={() => setEditing(true)}>
            Редактировать
          </button>
          <button className="button secondary" type="button" onClick={remove}>
            Удалить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="list-row">
      <div className="form" style={{ gap: 6 }}>
        <input
          className="input"
          value={draft.name}
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
        />
        <input
          className="input"
          type="number"
          min={0}
          value={draft.position}
          onChange={(event) => setDraft((prev) => ({ ...prev, position: Number(event.target.value) }))}
        />
      </div>
      <div className="auth-actions">
        <button className="button" type="button" onClick={save}>
          Сохранить
        </button>
        <button className="button secondary" type="button" onClick={() => setEditing(false)}>
          Отмена
        </button>
      </div>
    </div>
  );
}

function NomenclatureSection({
  categories,
  onMutate,
}: {
  categories: Category[];
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState({
    categoryId: "",
    code: "",
    name: "",
    unit: "₽/т",
    description: "",
  });

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.categoryId || !draft.code.trim() || !draft.name.trim()) return;
    const ok = await onMutate("/admin/content/indices/nomenclature", "POST", {
      categoryId: draft.categoryId,
      code: draft.code.trim(),
      name: draft.name.trim(),
      unit: draft.unit.trim() || "₽/т",
      description: draft.description.trim() || undefined,
    });
    if (ok) setDraft({ categoryId: draft.categoryId, code: "", name: "", unit: "₽/т", description: "" });
  }

  return (
    <section className="card form">
      <h2>Номенклатура</h2>
      <div className="stack-list">
        {categories.flatMap((category) =>
          category.nomenclatures.map((nomenclature) => (
            <NomenclatureRow
              key={nomenclature.id}
              category={category}
              nomenclature={nomenclature}
              categories={categories}
              onMutate={onMutate}
            />
          )),
        )}
      </div>
      <form className="form" onSubmit={create}>
        <select
          className="select"
          value={draft.categoryId}
          onChange={(event) => setDraft((prev) => ({ ...prev, categoryId: event.target.value }))}
          required
        >
          <option value="">Категория…</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="Код (например, МКР-КРТ-001)"
          value={draft.code}
          onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))}
          required
        />
        <input
          className="input"
          placeholder="Название"
          value={draft.name}
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
        <input
          className="input"
          placeholder="Единица (₽/т)"
          value={draft.unit}
          onChange={(event) => setDraft((prev) => ({ ...prev, unit: event.target.value }))}
        />
        <textarea
          className="textarea small"
          placeholder="Описание (необязательно)"
          value={draft.description}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
        />
        <button className="button" type="submit">
          Добавить номенклатуру
        </button>
      </form>
    </section>
  );
}

function NomenclatureRow({
  category,
  nomenclature,
  categories,
  onMutate,
}: {
  category: Category;
  nomenclature: Nomenclature;
  categories: Category[];
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    categoryId: nomenclature.categoryId,
    code: nomenclature.code,
    name: nomenclature.name,
    unit: nomenclature.unit,
    description: nomenclature.description ?? "",
  });

  useEffect(() => {
    setDraft({
      categoryId: nomenclature.categoryId,
      code: nomenclature.code,
      name: nomenclature.name,
      unit: nomenclature.unit,
      description: nomenclature.description ?? "",
    });
  }, [nomenclature.categoryId, nomenclature.code, nomenclature.name, nomenclature.unit, nomenclature.description]);

  async function save() {
    const ok = await onMutate(`/admin/content/indices/nomenclature/${nomenclature.id}`, "PATCH", {
      categoryId: draft.categoryId,
      code: draft.code.trim(),
      name: draft.name.trim(),
      unit: draft.unit.trim() || "₽/т",
      description: draft.description.trim() || null,
    });
    if (ok) setEditing(false);
  }

  async function remove() {
    if (!confirm(`Удалить номенклатуру «${nomenclature.name}»?`)) return;
    await onMutate(`/admin/content/indices/nomenclature/${nomenclature.id}`, "DELETE");
  }

  if (!editing) {
    return (
      <div className="list-row">
        <div>
          <strong>{nomenclature.name}</strong>
          <p className="page-subtitle">
            {category.name} · {nomenclature.code} · {nomenclature.unit}
          </p>
          {nomenclature.description ? <p>{nomenclature.description}</p> : null}
        </div>
        <div className="auth-actions">
          <button className="button secondary" type="button" onClick={() => setEditing(true)}>
            Редактировать
          </button>
          <button className="button secondary" type="button" onClick={remove}>
            Удалить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="list-row">
      <div className="form" style={{ gap: 6, flex: 1 }}>
        <select
          className="select"
          value={draft.categoryId}
          onChange={(event) => setDraft((prev) => ({ ...prev, categoryId: event.target.value }))}
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <input
          className="input"
          value={draft.code}
          onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))}
        />
        <input
          className="input"
          value={draft.name}
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
        />
        <input
          className="input"
          value={draft.unit}
          onChange={(event) => setDraft((prev) => ({ ...prev, unit: event.target.value }))}
        />
        <textarea
          className="textarea small"
          value={draft.description}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
        />
      </div>
      <div className="auth-actions">
        <button className="button" type="button" onClick={save}>
          Сохранить
        </button>
        <button className="button secondary" type="button" onClick={() => setEditing(false)}>
          Отмена
        </button>
      </div>
    </div>
  );
}

function PriceIndexCreator({
  categories,
  onMutate,
}: {
  categories: Category[];
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const nomenclaturesWithoutIndex = useMemo(
    () =>
      categories.flatMap((category) =>
        category.nomenclatures
          .filter((item) => !item.priceIndex)
          .map((item) => ({ category, nomenclature: item })),
      ),
    [categories],
  );

  const [draft, setDraft] = useState({ nomenclatureId: "", description: "" });

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.nomenclatureId) return;
    const ok = await onMutate("/admin/content/indices", "POST", {
      nomenclatureId: draft.nomenclatureId,
      description: draft.description.trim() || undefined,
    });
    if (ok) setDraft({ nomenclatureId: "", description: "" });
  }

  if (nomenclaturesWithoutIndex.length === 0) {
    return (
      <section className="card form">
        <h2>Создать индекс</h2>
        <p className="page-subtitle">Все позиции номенклатуры уже имеют индекс.</p>
      </section>
    );
  }

  return (
    <section className="card form">
      <h2>Создать индекс</h2>
      <form className="form" onSubmit={create}>
        <select
          className="select"
          value={draft.nomenclatureId}
          onChange={(event) => setDraft((prev) => ({ ...prev, nomenclatureId: event.target.value }))}
          required
        >
          <option value="">Номенклатура без индекса…</option>
          {nomenclaturesWithoutIndex.map(({ category, nomenclature }) => (
            <option key={nomenclature.id} value={nomenclature.id}>
              {category.name} · {nomenclature.name} ({nomenclature.code})
            </option>
          ))}
        </select>
        <textarea
          className="textarea small"
          placeholder="Служебное описание (необязательно)"
          value={draft.description}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
        />
        <button className="button" type="submit">
          Создать индекс
        </button>
      </form>
    </section>
  );
}

function PriceIndexCard({
  category,
  nomenclature,
  onMutate,
}: {
  category: Category;
  nomenclature: Nomenclature;
  onMutate: (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;
}) {
  const [valueDraft, setValueDraft] = useState({ date: "", price: "" });

  async function addValue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nomenclature.priceIndex || !valueDraft.date || !valueDraft.price) return;
    const ok = await onMutate(
      `/admin/content/indices/${nomenclature.priceIndex.id}/values`,
      "POST",
      {
        date: `${valueDraft.date}T00:00:00.000Z`,
        price: Number(valueDraft.price),
      },
    );
    if (ok) setValueDraft({ date: "", price: "" });
  }

  async function removeValue(valueId: string) {
    if (!nomenclature.priceIndex) return;
    if (!confirm("Удалить это значение?")) return;
    await onMutate(`/admin/content/indices/${nomenclature.priceIndex.id}/values/${valueId}`, "DELETE");
  }

  async function publish() {
    if (!nomenclature.priceIndex) return;
    await onMutate(`/admin/content/indices/${nomenclature.priceIndex.id}/publish`, "POST", {});
  }

  async function unpublish() {
    if (!nomenclature.priceIndex) return;
    await onMutate(`/admin/content/indices/${nomenclature.priceIndex.id}/unpublish`, "POST", {});
  }

  async function removeIndex() {
    if (!nomenclature.priceIndex) return;
    if (!confirm("Удалить индекс целиком? Это снимет все значения.")) return;
    await onMutate(`/admin/content/indices/${nomenclature.priceIndex.id}`, "DELETE");
  }

  const priceIndex = nomenclature.priceIndex;

  return (
    <article className="card support-ticket">
      <div className="list-row">
        <div>
          <h2>{nomenclature.name}</h2>
          <p className="page-subtitle">
            {category.name} · {nomenclature.code}
          </p>
        </div>
        <span className="status-pill">{priceIndex ? priceIndex.status : "нет индекса"}</span>
      </div>
      {!priceIndex ? (
        <p className="page-subtitle">Индекс ещё не создан — создайте его в левой колонке.</p>
      ) : (
        <>
          {priceIndex.description ? <p>{priceIndex.description}</p> : null}
          <p>Значений: {priceIndex.values.length}</p>
          <div className="stack-list">
            {priceIndex.values.map((value) => (
              <div className="list-row" key={value.id}>
                <span>
                  {new Date(value.date).toLocaleDateString("ru-RU")} — {Number(value.price).toLocaleString("ru-RU")} {nomenclature.unit}
                </span>
                <button className="button secondary" type="button" onClick={() => removeValue(value.id)}>
                  Удалить
                </button>
              </div>
            ))}
          </div>
          <form className="reply-form" onSubmit={addValue}>
            <input
              className="input"
              type="date"
              value={valueDraft.date}
              onChange={(event) => setValueDraft((prev) => ({ ...prev, date: event.target.value }))}
              required
            />
            <input
              className="input"
              type="number"
              min="1"
              placeholder="Цена"
              value={valueDraft.price}
              onChange={(event) => setValueDraft((prev) => ({ ...prev, price: event.target.value }))}
              required
            />
            <button className="button secondary" type="submit">
              Добавить значение
            </button>
          </form>
          <div className="auth-actions">
            {priceIndex.status !== "published" ? (
              <button className="button" type="button" onClick={publish}>
                Опубликовать
              </button>
            ) : (
              <button className="button secondary" type="button" onClick={unpublish}>
                Снять с публикации
              </button>
            )}
            <button className="button secondary" type="button" onClick={removeIndex}>
              Удалить индекс
            </button>
          </div>
        </>
      )}
    </article>
  );
}
