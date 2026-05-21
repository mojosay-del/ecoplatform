"use client";

import { useMemo } from "react";
import { FileUploadField } from "./FileUploadField";

// Универсальный композитор контентных блоков.
// Поддерживает все 10 типов, описанных в shared/content-blocks.
// Через allowedKinds родитель ограничивает выбор (новости — без чек-листов,
// уроки — ещё без audio/file).

export type BlockKind =
  | "heading"
  | "subheading"
  | "paragraph"
  | "image"
  | "gallery"
  | "video"
  | "audio"
  | "file"
  | "checklist"
  | "image_checklist";

export type Block = { type: BlockKind; payload: Record<string, unknown> };

export const ALL_BLOCK_KINDS: BlockKind[] = [
  "heading",
  "subheading",
  "paragraph",
  "image",
  "gallery",
  "video",
  "audio",
  "file",
  "checklist",
  "image_checklist",
];

export const NEWS_BLOCK_KINDS: BlockKind[] = [
  "heading",
  "subheading",
  "paragraph",
  "image",
  "gallery",
  "video",
  "audio",
];

export const LESSON_BLOCK_KINDS: BlockKind[] = [
  "heading",
  "subheading",
  "paragraph",
  "image",
  "gallery",
  "video",
];

const KIND_LABELS: Record<BlockKind, string> = {
  heading: "Заголовок",
  subheading: "Подзаголовок",
  paragraph: "Абзац",
  image: "Картинка",
  gallery: "Галерея",
  video: "Видео",
  audio: "Аудио",
  file: "Файл",
  checklist: "Чек-лист",
  image_checklist: "Чек-лист с картинкой",
};

const CHECKLIST_STYLES = [
  { value: "positive", label: "Положительный" },
  { value: "negative", label: "Отрицательный" },
  { value: "warning", label: "Предупреждение" },
  { value: "info", label: "Информация" },
] as const;

function defaultPayload(kind: BlockKind): Record<string, unknown> {
  switch (kind) {
    case "heading":
    case "subheading":
      return { text: "" };
    case "paragraph":
      return { markdown: "" };
    case "image":
      return { fileId: "", caption: "", altText: "" };
    case "gallery":
      return { images: [{ fileId: "", caption: "", altText: "" }] };
    case "video":
      return { rutubeUrl: "", caption: "" };
    case "audio":
      return { fileId: "", episodeTitle: "", caption: "" };
    case "file":
      return { fileId: "", displayName: "", description: "" };
    case "checklist":
      return { title: "", style: "positive", items: [""] };
    case "image_checklist":
      return {
        title: "",
        style: "positive",
        image: { fileId: "", caption: "", altText: "" },
        items: [""],
      };
  }
}

export function BlocksEditor({
  blocks,
  onChange,
  allowedKinds = ALL_BLOCK_KINDS,
}: {
  blocks: Block[];
  onChange: (next: Block[]) => void;
  allowedKinds?: BlockKind[];
}) {
  const addOptions = useMemo(() => allowedKinds, [allowedKinds]);

  function update(index: number, patch: Record<string, unknown>) {
    const next = blocks.map((block, idx) =>
      idx === index ? { ...block, payload: { ...block.payload, ...patch } } : block,
    );
    onChange(next);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  }

  function remove(index: number) {
    onChange(blocks.filter((_, idx) => idx !== index));
  }

  function add(kind: BlockKind) {
    onChange([...blocks, { type: kind, payload: defaultPayload(kind) }]);
  }

  return (
    <div className="stack-list">
      {blocks.length === 0 ? (
        <p className="page-subtitle">Блоков пока нет — добавьте первый ниже.</p>
      ) : null}

      {blocks.map((block, index) => (
        <article className="card" key={index}>
          <div className="list-row">
            <strong>
              {index + 1}. {KIND_LABELS[block.type]}
            </strong>
            <div className="auth-actions">
              <button className="button secondary" type="button" onClick={() => move(index, -1)} disabled={index === 0}>
                ↑
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === blocks.length - 1}
              >
                ↓
              </button>
              <button className="button secondary" type="button" onClick={() => remove(index)}>
                Удалить
              </button>
            </div>
          </div>
          <BlockBody block={block} onUpdate={(patch) => update(index, patch)} />
        </article>
      ))}

      <div className="auth-actions">
        <span className="page-subtitle">Добавить блок:</span>
        {addOptions.map((kind) => (
          <button className="button secondary" key={kind} type="button" onClick={() => add(kind)}>
            + {KIND_LABELS[kind]}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockBody({ block, onUpdate }: { block: Block; onUpdate: (patch: Record<string, unknown>) => void }) {
  switch (block.type) {
    case "heading":
    case "subheading":
      return (
        <input
          className="input"
          placeholder="Текст заголовка"
          value={(block.payload.text as string) ?? ""}
          onChange={(event) => onUpdate({ text: event.target.value })}
        />
      );
    case "paragraph":
      return (
        <textarea
          className="textarea"
          placeholder="Текст абзаца (markdown допустим)"
          value={(block.payload.markdown as string) ?? ""}
          onChange={(event) => onUpdate({ markdown: event.target.value })}
          rows={4}
        />
      );
    case "image":
      return (
        <div className="form" style={{ gap: 6 }}>
          <FileUploadField
            accept="image/*"
            buttonLabel="Загрузить картинку"
            label="ID изображения"
            value={(block.payload.fileId as string) ?? ""}
            onChange={(fileId, asset) => onUpdate({ fileId, altText: (block.payload.altText as string) || asset?.originalName || "" })}
          />
          <input
            className="input"
            placeholder="Подпись (необязательно)"
            value={(block.payload.caption as string) ?? ""}
            onChange={(event) => onUpdate({ caption: event.target.value })}
          />
          <input
            className="input"
            placeholder="Alt-текст для доступности"
            value={(block.payload.altText as string) ?? ""}
            onChange={(event) => onUpdate({ altText: event.target.value })}
          />
        </div>
      );
    case "gallery":
      return (
        <GalleryEditor
          images={(block.payload.images as Array<Record<string, unknown>>) ?? []}
          onChange={(images) => onUpdate({ images })}
        />
      );
    case "video":
      return (
        <div className="form" style={{ gap: 6 }}>
          <input
            className="input"
            placeholder="URL Rutube (https://rutube.ru/video/…)"
            value={(block.payload.rutubeUrl as string) ?? ""}
            onChange={(event) => onUpdate({ rutubeUrl: event.target.value })}
          />
          <input
            className="input"
            placeholder="Подпись (необязательно)"
            value={(block.payload.caption as string) ?? ""}
            onChange={(event) => onUpdate({ caption: event.target.value })}
          />
        </div>
      );
    case "audio":
      return (
        <div className="form" style={{ gap: 6 }}>
          <FileUploadField
            accept="audio/*"
            buttonLabel="Загрузить аудио"
            label="ID аудиофайла"
            value={(block.payload.fileId as string) ?? ""}
            onChange={(fileId, asset) => onUpdate({ fileId, episodeTitle: (block.payload.episodeTitle as string) || asset?.originalName || "" })}
          />
          <input
            className="input"
            placeholder="Название эпизода (необязательно)"
            value={(block.payload.episodeTitle as string) ?? ""}
            onChange={(event) => onUpdate({ episodeTitle: event.target.value })}
          />
          <input
            className="input"
            placeholder="Подпись (необязательно)"
            value={(block.payload.caption as string) ?? ""}
            onChange={(event) => onUpdate({ caption: event.target.value })}
          />
        </div>
      );
    case "file":
      return (
        <div className="form" style={{ gap: 6 }}>
          <FileUploadField
            buttonLabel="Загрузить файл"
            label="ID файла"
            value={(block.payload.fileId as string) ?? ""}
            onChange={(fileId, asset) => onUpdate({ fileId, displayName: (block.payload.displayName as string) || asset?.originalName || "" })}
          />
          <input
            className="input"
            placeholder="Отображаемое имя файла"
            value={(block.payload.displayName as string) ?? ""}
            onChange={(event) => onUpdate({ displayName: event.target.value })}
          />
          <input
            className="input"
            placeholder="Описание (необязательно)"
            value={(block.payload.description as string) ?? ""}
            onChange={(event) => onUpdate({ description: event.target.value })}
          />
        </div>
      );
    case "checklist":
      return (
        <ChecklistEditor
          title={(block.payload.title as string) ?? ""}
          style={(block.payload.style as string) ?? "positive"}
          items={(block.payload.items as string[]) ?? []}
          onChange={(patch) => onUpdate(patch)}
        />
      );
    case "image_checklist":
      return (
        <ImageChecklistEditor
          title={(block.payload.title as string) ?? ""}
          style={(block.payload.style as string) ?? "positive"}
          image={(block.payload.image as Record<string, unknown>) ?? {}}
          items={(block.payload.items as string[]) ?? []}
          onChange={(patch) => onUpdate(patch)}
        />
      );
  }
}

function GalleryEditor({
  images,
  onChange,
}: {
  images: Array<Record<string, unknown>>;
  onChange: (next: Array<Record<string, unknown>>) => void;
}) {
  function updateAt(index: number, patch: Record<string, unknown>) {
    onChange(images.map((image, idx) => (idx === index ? { ...image, ...patch } : image)));
  }
  function add() {
    onChange([...images, { fileId: "", caption: "", altText: "" }]);
  }
  function remove(index: number) {
    onChange(images.filter((_, idx) => idx !== index));
  }
  return (
    <div className="stack-list">
      {images.map((image, index) => (
        <div className="form" key={index} style={{ gap: 4 }}>
          <div className="list-row">
            <strong>Картинка {index + 1}</strong>
            <button className="button secondary" type="button" onClick={() => remove(index)} disabled={images.length === 1}>
              ✕ Убрать картинку
            </button>
          </div>
          <FileUploadField
            accept="image/*"
            buttonLabel="Загрузить картинку"
            label="ID изображения"
            value={(image.fileId as string) ?? ""}
            onChange={(fileId, asset) => updateAt(index, { fileId, altText: (image.altText as string) || asset?.originalName || "" })}
          />
          <input
            className="input"
            placeholder="Подпись"
            value={(image.caption as string) ?? ""}
            onChange={(event) => updateAt(index, { caption: event.target.value })}
          />
          <input
            className="input"
            placeholder="Alt-текст"
            value={(image.altText as string) ?? ""}
            onChange={(event) => updateAt(index, { altText: event.target.value })}
          />
        </div>
      ))}
      <button className="button secondary" type="button" onClick={add}>
        + Добавить картинку
      </button>
    </div>
  );
}

function ChecklistEditor({
  title,
  style,
  items,
  onChange,
}: {
  title: string;
  style: string;
  items: string[];
  onChange: (patch: { title?: string; style?: string; items?: string[] }) => void;
}) {
  function updateItem(index: number, value: string) {
    const next = items.map((item, idx) => (idx === index ? value : item));
    onChange({ items: next });
  }
  function add() {
    onChange({ items: [...items, ""] });
  }
  function remove(index: number) {
    onChange({ items: items.filter((_, idx) => idx !== index) });
  }
  return (
    <div className="form" style={{ gap: 6 }}>
      <input
        className="input"
        placeholder="Заголовок чек-листа"
        value={title}
        onChange={(event) => onChange({ title: event.target.value })}
      />
      <select className="select" value={style} onChange={(event) => onChange({ style: event.target.value })}>
        {CHECKLIST_STYLES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="stack-list">
        {items.map((item, index) => (
          <div className="list-row" key={index}>
            <input
              className="input"
              placeholder={`Пункт ${index + 1}`}
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="button secondary"
              type="button"
              onClick={() => remove(index)}
              disabled={items.length === 1}
            >
              ✕ Пункт
            </button>
          </div>
        ))}
      </div>
      <button className="button secondary" type="button" onClick={add}>
        + Добавить пункт
      </button>
    </div>
  );
}

function ImageChecklistEditor({
  title,
  style,
  image,
  items,
  onChange,
}: {
  title: string;
  style: string;
  image: Record<string, unknown>;
  items: string[];
  onChange: (patch: {
    title?: string;
    style?: string;
    image?: Record<string, unknown>;
    items?: string[];
  }) => void;
}) {
  function updateItem(index: number, value: string) {
    const next = items.map((item, idx) => (idx === index ? value : item));
    onChange({ items: next });
  }
  function addItem() {
    onChange({ items: [...items, ""] });
  }
  function removeItem(index: number) {
    onChange({ items: items.filter((_, idx) => idx !== index) });
  }
  return (
    <div className="form" style={{ gap: 8 }}>
      <input
        className="input"
        placeholder="Заголовок чек-листа"
        value={title}
        onChange={(event) => onChange({ title: event.target.value })}
      />
      <select className="select" value={style} onChange={(event) => onChange({ style: event.target.value })}>
        {CHECKLIST_STYLES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <p className="page-subtitle">Картинка чек-листа</p>
      <FileUploadField
        accept="image/*"
        buttonLabel="Загрузить картинку"
        label="ID картинки"
        value={(image.fileId as string) ?? ""}
        onChange={(fileId, asset) => onChange({ image: { ...image, fileId, altText: (image.altText as string) || asset?.originalName || "" } })}
      />
      <input
        className="input"
        placeholder="Подпись"
        value={(image.caption as string) ?? ""}
        onChange={(event) => onChange({ image: { ...image, caption: event.target.value } })}
      />
      <input
        className="input"
        placeholder="Alt-текст"
        value={(image.altText as string) ?? ""}
        onChange={(event) => onChange({ image: { ...image, altText: event.target.value } })}
      />
      <p className="page-subtitle">Пункты чек-листа</p>
      <div className="stack-list">
        {items.map((item, index) => (
          <div className="list-row" key={index}>
            <input
              className="input"
              placeholder={`Пункт ${index + 1}`}
              value={item}
              onChange={(event) => updateItem(index, event.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="button secondary"
              type="button"
              onClick={() => removeItem(index)}
              disabled={items.length === 1}
            >
              ✕ Пункт
            </button>
          </div>
        ))}
      </div>
      <button className="button secondary" type="button" onClick={addItem}>
        + Добавить пункт
      </button>
    </div>
  );
}
