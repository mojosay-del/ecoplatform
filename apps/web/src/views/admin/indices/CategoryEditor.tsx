"use client";

// Правая панель при выборе категории: переименование и позиция.

import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Category, MutateFn } from "./types";

export function CategoryEditor({
  category,
  onMutate,
  onAddNomenclature,
  onDeleteCategory,
}: {
  category: Category;
  onMutate: MutateFn;
  onAddNomenclature: (category: Category) => void;
  onDeleteCategory: (category: Category) => void;
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
      <label className="form-field news-content-field">
        <span>Название категории</span>
        <input
          className="news-form-lead education-module-title-input"
          value={draft.name}
          placeholder="Например: «Бумага и картон»"
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
      </label>
      <label className="form-field news-content-field">
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
          <button className="button secondary" type="button" onClick={() => onAddNomenclature(category)}>
            <Plus size={14} />
            Номенклатура
          </button>
          <button className="button secondary danger" type="button" onClick={() => onDeleteCategory(category)}>
            <Trash2 size={14} />
            Удалить категорию
          </button>
          <button className="button" type="submit" disabled={!hasChanges || saving}>
            {saving ? "Сохраняю…" : "Сохранить"}
          </button>
        </div>
      </div>
    </form>
  );
}
