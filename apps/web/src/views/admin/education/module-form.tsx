"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FileUploadField } from "../../../components/FileUploadField";
import { LEARNING_ACCESS_LEVEL_LABELS } from "../../../lib/display-labels";
import { MODULE_ACCESS_OPTIONS } from "./constants";
import type { EducationMutation, LearningModule, SetEducationSelection } from "./types";

export function ModuleForm({
  module,
  onMutate,
  onSelect,
}: {
  module: LearningModule;
  onMutate: EducationMutation;
  onSelect: SetEducationSelection;
}) {
  const [draft, setDraft] = useState({
    title: module.title,
    summary: module.summary,
    description: module.description,
    coverImageId: module.coverImageId ?? "",
    accessLevel: module.accessLevel,
    oneTimePrice: module.oneTimePrice ?? 0,
    isInDevelopment: module.isInDevelopment,
    promotionalDescription: module.preview?.promotionalDescription ?? "",
    whatYouWillLearn: module.preview?.whatYouWillLearn ?? [],
  });
  const [saving, setSaving] = useState(false);
  const preview = module.preview ?? { promotionalDescription: "", whatYouWillLearn: [] };

  useEffect(() => {
    setDraft({
      title: module.title,
      summary: module.summary,
      description: module.description,
      coverImageId: module.coverImageId ?? "",
      accessLevel: module.accessLevel,
      oneTimePrice: module.oneTimePrice ?? 0,
      isInDevelopment: module.isInDevelopment,
      promotionalDescription: module.preview?.promotionalDescription ?? "",
      whatYouWillLearn: module.preview?.whatYouWillLearn ?? [],
    });
  }, [
    module.id,
    module.title,
    module.summary,
    module.description,
    module.coverImageId,
    module.accessLevel,
    module.oneTimePrice,
    module.isInDevelopment,
    module.preview,
  ]);

  const hasChanges =
    draft.title !== module.title ||
    draft.summary !== module.summary ||
    draft.description !== module.description ||
    draft.coverImageId !== (module.coverImageId ?? "") ||
    draft.accessLevel !== module.accessLevel ||
    draft.oneTimePrice !== (module.oneTimePrice ?? 0) ||
    draft.isInDevelopment !== module.isInDevelopment ||
    draft.promotionalDescription !== preview.promotionalDescription ||
    JSON.stringify(draft.whatYouWillLearn) !== JSON.stringify(preview.whatYouWillLearn);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await onMutate(`/admin/content/education/modules/${module.id}`, "PATCH", {
        title: draft.title,
        summary: draft.summary,
        description: draft.description,
        coverImageId: draft.coverImageId.trim() || null,
        accessLevel: draft.accessLevel,
        oneTimePrice: draft.accessLevel === "one_time" && draft.oneTimePrice > 0 ? draft.oneTimePrice : null,
        isInDevelopment: draft.isInDevelopment,
        preview: {
          promotionalDescription: draft.promotionalDescription,
          whatYouWillLearn: draft.whatYouWillLearn.map((item) => item.trim()).filter(Boolean),
        },
      });
    } finally {
      setSaving(false);
    }
  }

  async function publishToggleModule() {
    const path =
      module.status === "published"
        ? `/admin/content/education/modules/${module.id}/unpublish`
        : `/admin/content/education/modules/${module.id}/publish`;
    await onMutate(path, "POST");
  }

  async function addChapter() {
    await onMutate(`/admin/content/education/modules/${module.id}/chapters`, "POST", {
      title: `Глава ${module.chapters.length + 1}`,
      position: module.chapters.length,
    });
  }

  async function removeModule() {
    if (!confirm(`Удалить модуль «${module.title}»? Все главы и уроки будут удалены.`)) return;
    const ok = await onMutate(`/admin/content/education/modules/${module.id}`, "DELETE");
    if (ok) onSelect({ kind: "none" });
  }

  function addLearningPoint() {
    setDraft((prev) => ({
      ...prev,
      whatYouWillLearn: [...prev.whatYouWillLearn, ""],
    }));
  }

  return (
    <form className="form news-form education-detail-form" onSubmit={submit}>
      <header className="module-form-header">
        <span className="news-form-mode">Модуль</span>
        <div className="module-form-controls">
          <div className="module-access-segment" role="radiogroup" aria-label="Уровень доступа">
            {MODULE_ACCESS_OPTIONS.map((accessLevel) => (
              <label className="module-access-option" key={accessLevel}>
                <input
                  type="radio"
                  name={`module-access-${module.id}`}
                  value={accessLevel}
                  checked={draft.accessLevel === accessLevel}
                  onChange={() => setDraft((prev) => ({ ...prev, accessLevel }))}
                />
                <span>{LEARNING_ACCESS_LEVEL_LABELS[accessLevel]}</span>
              </label>
            ))}
          </div>
          <label className="module-development-toggle">
            <input
              checked={draft.isInDevelopment}
              onChange={(event) => setDraft((prev) => ({ ...prev, isInDevelopment: event.target.checked }))}
              type="checkbox"
            />
            <span className="module-development-toggle-track" aria-hidden="true" />
            <span>В разработке</span>
          </label>
        </div>
      </header>
      <label className="form-field news-content-field">
        <span>Название</span>
        <input
          className="news-form-lead education-module-title-input"
          placeholder="Название модуля…"
          value={draft.title}
          onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          required
        />
      </label>
      <div className="form-field news-content-field news-form-preview">
        <span>Обложка модуля</span>
        <FileUploadField
          accept="image/*"
          buttonLabel={draft.coverImageId ? "Заменить обложку" : "Загрузить обложку"}
          hideLabel
          imagePreset="cover"
          label="Обложка модуля"
          value={draft.coverImageId}
          onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
        />
      </div>
      <label className="form-field news-content-field">
        <span>Краткое описание</span>
        <input
          className="news-form-lead"
          placeholder="Краткое описание"
          value={draft.summary}
          onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))}
          required
        />
      </label>
      <label className="form-field news-content-field">
        <span>Описание для превью (доступно без подписки)</span>
        <input
          className="news-form-lead"
          placeholder="Описание для превью"
          value={draft.promotionalDescription}
          onChange={(event) => setDraft((prev) => ({ ...prev, promotionalDescription: event.target.value }))}
          required
        />
      </label>
      <label className="form-field news-content-field">
        <span>Полное описание</span>
        <input
          className="news-form-lead"
          placeholder="Полное описание"
          value={draft.description}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
          required
        />
      </label>
      {draft.accessLevel === "one_time" ? (
        <label className="form-field news-content-field">
          <span>Цена разовой покупки (рубли)</span>
          <input
            className="input"
            type="number"
            min={1}
            value={draft.oneTimePrice}
            onChange={(event) => setDraft((prev) => ({ ...prev, oneTimePrice: Number(event.target.value) }))}
          />
        </label>
      ) : null}
      <div className="form-field news-content-field education-list-field">
        <div className="education-list-field-head">
          <span>Что узнает пользователь</span>
          <button type="button" className="education-inline-add" onClick={addLearningPoint} aria-label="Добавить пункт">
            <Plus size={14} />
          </button>
        </div>
        <div className="education-learning-list">
          {draft.whatYouWillLearn.map((bulletItem, index) => (
            <div className="education-learning-row" key={index}>
              <button
                className="education-learning-remove"
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    whatYouWillLearn: prev.whatYouWillLearn.filter((_, idx) => idx !== index),
                  }))
                }
                aria-label="Удалить пункт"
              >
                <Trash2 size={14} />
              </button>
              <input
                className="news-form-lead education-learning-input"
                value={bulletItem}
                placeholder="Пункт программы"
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    whatYouWillLearn: prev.whatYouWillLearn.map((item, idx) =>
                      idx === index ? event.target.value : item,
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </div>
      <div className="lesson-save-bar news-save-bar education-detail-save-bar">
        <span className={`lesson-save-bar-status${hasChanges ? " has-changes" : " is-saved"}`}>
          {saving ? "Сохраняю…" : hasChanges ? "Есть несохранённые изменения" : "Сохранено"}
        </span>
        <div className="lesson-save-bar-actions">
          <button className="button secondary" type="button" onClick={addChapter}>
            <Plus size={14} />
            Глава
          </button>
          <button className="button secondary" type="button" onClick={publishToggleModule}>
            {module.status === "published" ? "Снять с публикации" : "Опубликовать"}
          </button>
          <button className="button secondary danger" type="button" onClick={removeModule}>
            <Trash2 size={14} />
            Удалить
          </button>
          <button className="button" type="submit" disabled={!hasChanges || saving}>
            {saving ? "Сохраняю…" : "Сохранить модуль"}
          </button>
        </div>
      </div>
    </form>
  );
}
