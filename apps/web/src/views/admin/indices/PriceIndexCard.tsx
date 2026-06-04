"use client";

// Правая панель при выборе номенклатуры: редактирование кода/названия,
// создание/удаление/публикация индекса цен и ведение истории значений.

import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { StatusPill } from "../../../components/StatusPill";
import { normalizeIntegerPriceInput, parseIntegerPriceInput } from "../../../components/admin-indices-price";
import { CONTENT_STATUS_LABELS } from "../../../lib/display-labels";
import { formatIndexPrice } from "./format";
import type { Category, MutateFn, Nomenclature } from "./types";

export function PriceIndexCard({
  category,
  nomenclature,
  onMutate,
  onDeleteNomenclature,
}: {
  category: Category;
  nomenclature: Nomenclature;
  onMutate: MutateFn;
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
