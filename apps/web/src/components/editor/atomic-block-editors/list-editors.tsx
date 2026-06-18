"use client";

import { Plus, Trash2 } from "lucide-react";
import { FileUploadField } from "../../FileUploadField";
import styles from "../document-editor.module.css";
import type { Img, PatchFn } from "./types";
import { str } from "./utils";

const CHECKLIST_STYLES = [
  { value: "positive", label: "Положительный" },
  { value: "negative", label: "Отрицательный" },
  { value: "warning", label: "Предупреждение" },
  { value: "info", label: "Информация" },
] as const;

function StyleSelect({ value, onChange }: { value: string; onChange: (style: string) => void }) {
  return (
    <select className="select" value={value} onChange={(event) => onChange(event.target.value)}>
      {CHECKLIST_STYLES.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ItemsEditor({ items, onChange }: { items: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="stack-list">
      {items.map((item, index) => (
        <div className="list-row" key={index}>
          <input
            className="input"
            placeholder={`Пункт ${index + 1}`}
            value={item}
            onChange={(event) => onChange(items.map((value, idx) => (idx === index ? event.target.value : value)))}
            style={{ flex: 1 }}
          />
          <button
            className="icon-button"
            type="button"
            onClick={() => onChange(items.filter((_, idx) => idx !== index))}
            disabled={items.length === 1}
            aria-label="Удалить пункт"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button className="button secondary" type="button" onClick={() => onChange([...items, ""])}>
        <Plus size={14} /> Добавить пункт
      </button>
    </div>
  );
}

export function ChecklistEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
  const items = (payload.items as string[]) ?? [""];
  return (
    <div className="form" style={{ gap: 6 }}>
      <input
        className="input"
        placeholder="Заголовок чек-листа"
        value={str(payload.title)}
        onChange={(event) => onChange({ title: event.target.value })}
      />
      <StyleSelect value={str(payload.style) || "positive"} onChange={(style) => onChange({ style })} />
      <ItemsEditor items={items} onChange={(next) => onChange({ items: next })} />
    </div>
  );
}

export function ImageChecklistEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
  const items = (payload.items as string[]) ?? [""];
  const image = (payload.image as Img) ?? {};
  return (
    <div className="form" style={{ gap: 8 }}>
      <input
        className="input"
        placeholder="Заголовок чек-листа"
        value={str(payload.title)}
        onChange={(event) => onChange({ title: event.target.value })}
      />
      <StyleSelect value={str(payload.style) || "positive"} onChange={(style) => onChange({ style })} />
      <FileUploadField
        accept="image/*"
        buttonLabel="Загрузить картинку"
        label="Картинка чек-листа"
        value={str(image.fileId)}
        onChange={(fileId, asset) =>
          onChange({ image: { ...image, fileId, altText: str(image.altText) || asset?.originalName || "" } })
        }
      />
      <input
        className="input"
        placeholder="Подпись картинки"
        value={str(image.caption)}
        onChange={(event) => onChange({ image: { ...image, caption: event.target.value } })}
      />
      <ItemsEditor items={items} onChange={(next) => onChange({ items: next })} />
    </div>
  );
}

export function LessonTasksEditor({ tasks, onChange }: { tasks: Img[]; onChange: (next: Img[]) => void }) {
  const list = tasks.length > 0 ? tasks : [{ title: "", description: "" }];
  function updateTask(index: number, patch: Img) {
    onChange(list.map((task, idx) => (idx === index ? { ...task, ...patch } : task)));
  }
  return (
    <div className="form" style={{ gap: 8 }}>
      {list.map((task, index) => (
        <div className={styles.taskRow} key={index}>
          <span className={styles.taskIndex}>{index + 1}</span>
          <div className="form" style={{ gap: 4, flex: 1 }}>
            <input
              className="input"
              placeholder={`Задача ${index + 1}`}
              value={str(task.title)}
              onChange={(event) => updateTask(index, { title: event.target.value })}
            />
            <input
              className="input"
              placeholder="Подсказка (необязательно)"
              value={str(task.description)}
              onChange={(event) => updateTask(index, { description: event.target.value })}
            />
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={() => onChange(list.filter((_, idx) => idx !== index))}
            disabled={list.length === 1}
            aria-label="Удалить задачу"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        className="button secondary"
        type="button"
        onClick={() => onChange([...list, { title: "", description: "" }])}
      >
        <Plus size={14} /> Добавить задачу
      </button>
    </div>
  );
}
