"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Chapter, EducationMutation } from "./types";

export function ChapterForm({ chapter, onMutate }: { chapter: Chapter; onMutate: EducationMutation }) {
  const [title, setTitle] = useState(chapter.title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(chapter.title);
  }, [chapter.id, chapter.title]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    await onMutate(`/admin/content/education/chapters/${chapter.id}`, "PATCH", { title });
    setSaving(false);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h2>Глава</h2>
      <label className="form-field">
        <span>Название</span>
        <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>
      <p className="page-subtitle">Порядок глав меняется стрелками ↑↓ в списке слева.</p>
      <button className="button" type="submit" disabled={saving}>
        {saving ? "Сохраняю…" : "Сохранить главу"}
      </button>
    </form>
  );
}
