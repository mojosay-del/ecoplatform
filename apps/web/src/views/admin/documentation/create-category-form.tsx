"use client";

import { useState, type FormEvent } from "react";

export function DocCategoryCreateForm({
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
      <h2>Новый раздел</h2>
      <label className="form-field news-content-field">
        <span>Название</span>
        <input
          className="news-form-lead education-module-title-input"
          placeholder="Например: «Регламенты и законы»"
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
          {saving ? "Создаётся..." : "Создать"}
        </button>
      </div>
    </form>
  );
}
