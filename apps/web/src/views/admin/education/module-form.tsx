"use client";

import { useEffect, useState, type FormEvent } from "react";
import { FileUploadField } from "../../../components/FileUploadField";
import { LEARNING_ACCESS_LEVEL_LABELS } from "../../../lib/display-labels";
import { MODULE_ACCESS_OPTIONS } from "./constants";
import type { EducationMutation, LearningModule } from "./types";

export function ModuleForm({ module, onMutate }: { module: LearningModule; onMutate: EducationMutation }) {
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
  const [bullet, setBullet] = useState("");
  const [saving, setSaving] = useState(false);

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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
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
        whatYouWillLearn: draft.whatYouWillLearn,
      },
    });
    setSaving(false);
  }

  return (
    <form className="form news-form" onSubmit={submit}>
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
      <div className="news-form-preview">
        <FileUploadField
          accept="image/*"
          buttonLabel={draft.coverImageId ? "Заменить обложку" : "Загрузить обложку"}
          imagePreset="cover"
          label="Обложка модуля"
          value={draft.coverImageId}
          onChange={(fileId) => setDraft((prev) => ({ ...prev, coverImageId: fileId }))}
        />
      </div>
      <label className="form-field news-content-field">
        <span>Название</span>
        <input
          className="news-form-title"
          placeholder="Название модуля…"
          value={draft.title}
          onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
          required
        />
      </label>
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
      <div className="form-field news-content-field">
        <span>Что узнает пользователь</span>
        <div className="stack-list">
          {draft.whatYouWillLearn.map((bulletItem, index) => (
            <div className="list-row" key={index}>
              <input
                className="input"
                value={bulletItem}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    whatYouWillLearn: prev.whatYouWillLearn.map((item, idx) =>
                      idx === index ? event.target.value : item,
                    ),
                  }))
                }
                style={{ flex: 1 }}
              />
              <button
                className="button secondary"
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    whatYouWillLearn: prev.whatYouWillLearn.filter((_, idx) => idx !== index),
                  }))
                }
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
        <div className="list-row">
          <input
            className="input"
            placeholder="Новый пункт"
            value={bullet}
            onChange={(event) => setBullet(event.target.value)}
            style={{ flex: 1 }}
          />
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              if (!bullet.trim()) return;
              setDraft((prev) => ({
                ...prev,
                whatYouWillLearn: [...prev.whatYouWillLearn, bullet.trim()],
              }));
              setBullet("");
            }}
          >
            + Пункт
          </button>
        </div>
      </div>
      <button className="button" type="submit" disabled={saving}>
        {saving ? "Сохраняю…" : "Сохранить модуль"}
      </button>
    </form>
  );
}
