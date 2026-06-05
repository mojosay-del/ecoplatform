"use client";

import { Plus, X } from "lucide-react";
import { FileUploadField } from "../../FileUploadField";
import type { Img, PatchFn } from "./types";
import { str } from "./utils";

export function ImagePayloadEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
  return (
    <div className="form" style={{ gap: 6 }}>
      <FileUploadField
        accept="image/*"
        buttonLabel="Загрузить картинку"
        label="Изображение"
        value={str(payload.fileId)}
        onChange={(fileId, asset) => onChange({ fileId, altText: str(payload.altText) || asset?.originalName || "" })}
      />
      <input
        className="input"
        placeholder="Подпись (необязательно)"
        value={str(payload.caption)}
        onChange={(event) => onChange({ caption: event.target.value })}
      />
      <input
        className="input"
        placeholder="Alt-текст для доступности"
        value={str(payload.altText)}
        onChange={(event) => onChange({ altText: event.target.value })}
      />
    </div>
  );
}

export function VideoPayloadEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
  return (
    <div className="form" style={{ gap: 6 }}>
      <FileUploadField
        accept="video/*"
        buttonLabel="Загрузить видео"
        label="Видеофайл"
        value={str(payload.fileId)}
        onChange={(fileId) => onChange({ fileId })}
      />
      <input
        className="input"
        placeholder="Подпись (необязательно)"
        value={str(payload.caption)}
        onChange={(event) => onChange({ caption: event.target.value })}
      />
    </div>
  );
}

export function AudioPayloadEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
  return (
    <div className="form" style={{ gap: 6 }}>
      <FileUploadField
        accept="audio/*"
        buttonLabel="Загрузить аудио"
        label="Аудиофайл"
        value={str(payload.fileId)}
        onChange={(fileId, asset) =>
          onChange({ fileId, episodeTitle: str(payload.episodeTitle) || asset?.originalName || "" })
        }
      />
      <input
        className="input"
        placeholder="Название эпизода (необязательно)"
        value={str(payload.episodeTitle)}
        onChange={(event) => onChange({ episodeTitle: event.target.value })}
      />
      <input
        className="input"
        placeholder="Подпись (необязательно)"
        value={str(payload.caption)}
        onChange={(event) => onChange({ caption: event.target.value })}
      />
    </div>
  );
}

export function FilePayloadEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
  return (
    <div className="form" style={{ gap: 6 }}>
      <FileUploadField
        buttonLabel="Загрузить файл"
        label="Файл"
        value={str(payload.fileId)}
        onChange={(fileId, asset) =>
          onChange({ fileId, displayName: str(payload.displayName) || asset?.originalName || "" })
        }
      />
      <input
        className="input"
        placeholder="Отображаемое имя файла"
        value={str(payload.displayName)}
        onChange={(event) => onChange({ displayName: event.target.value })}
      />
      <input
        className="input"
        placeholder="Описание (необязательно)"
        value={str(payload.description)}
        onChange={(event) => onChange({ description: event.target.value })}
      />
    </div>
  );
}

export function GalleryEditor({ images, onChange }: { images: Img[]; onChange: (next: Img[]) => void }) {
  function updateAt(index: number, patch: Img) {
    onChange(images.map((image, idx) => (idx === index ? { ...image, ...patch } : image)));
  }
  function add() {
    onChange([...images, { fileId: "", caption: "", altText: "" }]);
  }
  function remove(index: number) {
    onChange(images.filter((_, idx) => idx !== index));
  }

  return (
    <div className="form" style={{ gap: 8 }}>
      <div className="doc-gallery-grid">
        {images.map((image, index) => (
          <div className="doc-gallery-tile" key={index}>
            <button
              type="button"
              className="doc-gallery-remove"
              onClick={() => remove(index)}
              aria-label="Удалить изображение"
              title="Удалить изображение"
            >
              <X size={13} />
            </button>
            <FileUploadField
              accept="image/*"
              buttonLabel="Изображение"
              hideLabel
              tile
              value={str(image.fileId)}
              onChange={(fileId, asset) =>
                updateAt(index, { fileId, altText: str(image.altText) || asset?.originalName || "" })
              }
            />
            <input
              className="input"
              placeholder="Подпись"
              value={str(image.caption)}
              onChange={(event) => updateAt(index, { caption: event.target.value })}
            />
          </div>
        ))}
      </div>
      <button className="button secondary" type="button" onClick={add}>
        <Plus size={14} /> Добавить изображение
      </button>
    </div>
  );
}
