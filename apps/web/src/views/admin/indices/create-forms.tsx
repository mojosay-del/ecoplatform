"use client";

// Инлайн-форма создания новой номенклатуры в плоском списке каталога.
// Сохраняется через общий onMutate и закрывается по onClose.

import { FormEvent, useState } from "react";
import type { MutateFn } from "./types";

export function NomenclatureCreateForm({ onMutate, onClose }: { onMutate: MutateFn; onClose: () => void }) {
  const [draft, setDraft] = useState({ name: "", code: "" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.code.trim() || !draft.name.trim()) return;
    const ok = await onMutate("/admin/content/indices/nomenclature", "POST", {
      code: draft.code.trim(),
      name: draft.name.trim(),
    });
    if (ok) onClose();
  }

  return (
    <form className="card form indices-inline-form" onSubmit={submit}>
      <label className="form-field news-content-field">
        <span>Название сырья</span>
        <input
          className="news-form-lead education-module-title-input"
          value={draft.name}
          onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
          required
        />
      </label>
      <label className="form-field news-content-field">
        <span>Код</span>
        <input
          className="news-form-lead"
          placeholder="например, МС5-Б"
          value={draft.code}
          onChange={(event) => setDraft((prev) => ({ ...prev, code: event.target.value }))}
          required
        />
      </label>
      <div className="form-actions">
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
