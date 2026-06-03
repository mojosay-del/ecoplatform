"use client";

import { Plus, Trash2, X } from "lucide-react";
import { FileUploadField } from "../FileUploadField";
import type { AtomicBlockKind } from "../../lib/editor/block-mapping";

// Редакторы содержимого (payload) атомарных блоков. Используются внутри
// node-view редактора (atomic-nodes.tsx). Каждый получает текущий payload и
// onChange(patch) — частичное слияние выполняет node-view.

type PatchFn = (patch: Record<string, unknown>) => void;
type Img = Record<string, unknown>;

const CHECKLIST_STYLES = [
  { value: "positive", label: "Положительный" },
  { value: "negative", label: "Отрицательный" },
  { value: "warning", label: "Предупреждение" },
  { value: "info", label: "Информация" },
] as const;

export function AtomicBlockEditor({
  kind,
  payload,
  onChange,
}: {
  kind: AtomicBlockKind;
  payload: Record<string, unknown>;
  onChange: PatchFn;
}) {
  switch (kind) {
    case "image":
      return <ImagePayloadEditor payload={payload} onChange={onChange} />;
    case "video":
      return <VideoPayloadEditor payload={payload} onChange={onChange} />;
    case "audio":
      return <AudioPayloadEditor payload={payload} onChange={onChange} />;
    case "file":
      return <FilePayloadEditor payload={payload} onChange={onChange} />;
    case "gallery":
      return <GalleryEditor images={(payload.images as Img[]) ?? []} onChange={(images) => onChange({ images })} />;
    case "checklist":
      return <ChecklistEditor payload={payload} onChange={onChange} />;
    case "image_checklist":
      return <ImageChecklistEditor payload={payload} onChange={onChange} />;
    case "lesson_tasks":
      return <LessonTasksEditor tasks={(payload.tasks as Img[]) ?? []} onChange={(tasks) => onChange({ tasks })} />;
    case "quiz":
      return <QuizEditor payload={payload} onChange={onChange} />;
    case "matching":
      return <MatchingEditor payload={payload} onChange={onChange} />;
  }
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// --- Картинка / Видео / Аудио / Файл ---------------------------------------

function ImagePayloadEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
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

function VideoPayloadEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
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

function AudioPayloadEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
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

function FilePayloadEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
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

// --- Галерея ----------------------------------------------------------------

function GalleryEditor({ images, onChange }: { images: Img[]; onChange: (next: Img[]) => void }) {
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

// --- Чек-лист / Чек-лист с картинкой ---------------------------------------

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

function ChecklistEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
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

function ImageChecklistEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
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

// --- Задания урока ----------------------------------------------------------

function LessonTasksEditor({ tasks, onChange }: { tasks: Img[]; onChange: (next: Img[]) => void }) {
  const list = tasks.length > 0 ? tasks : [{ title: "", description: "" }];
  function updateTask(index: number, patch: Img) {
    onChange(list.map((task, idx) => (idx === index ? { ...task, ...patch } : task)));
  }
  return (
    <div className="form" style={{ gap: 8 }}>
      {list.map((task, index) => (
        <div className="doc-task-row" key={index}>
          <span className="doc-task-index">{index + 1}</span>
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

// --- Тест (выбор ответа) ----------------------------------------------------

type QuizOption = { text: string; correct: boolean };

function QuizEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
  const multiple = Boolean(payload.multiple);
  const options: QuizOption[] =
    (payload.options as QuizOption[])?.map((option) => ({
      text: str(option?.text),
      correct: Boolean(option?.correct),
    })) ?? [];

  function setOptions(next: QuizOption[]) {
    onChange({ options: next });
  }
  function setOption(index: number, patch: Partial<QuizOption>) {
    setOptions(options.map((option, idx) => (idx === index ? { ...option, ...patch } : option)));
  }
  function chooseCorrect(index: number, value: boolean) {
    if (multiple) {
      setOption(index, { correct: value });
    } else {
      // один правильный: помечаем выбранный, снимаем остальные
      setOptions(options.map((option, idx) => ({ ...option, correct: idx === index })));
    }
  }
  function toggleMultiple(next: boolean) {
    if (!next) {
      // при переходе в «один ответ» оставляем правильным только первый отмеченный
      const firstCorrect = options.findIndex((option) => option.correct);
      onChange({
        multiple: false,
        options: options.map((option, idx) => ({ ...option, correct: idx === firstCorrect })),
      });
    } else {
      onChange({ multiple: true });
    }
  }

  return (
    <div className="form" style={{ gap: 8 }}>
      <input
        className="input"
        placeholder="Текст вопроса"
        value={str(payload.question)}
        onChange={(event) => onChange({ question: event.target.value })}
      />
      <label className="doc-quiz-multiple">
        <input type="checkbox" checked={multiple} onChange={(event) => toggleMultiple(event.target.checked)} />
        Несколько правильных ответов
      </label>

      <div className="stack-list">
        {options.map((option, index) => (
          <div className="doc-quiz-option" key={index}>
            <input
              type={multiple ? "checkbox" : "radio"}
              className="doc-quiz-correct"
              name="quiz-correct"
              checked={option.correct}
              onChange={(event) => chooseCorrect(index, event.target.checked)}
              title="Отметить правильным"
              aria-label="Правильный вариант"
            />
            <input
              className="input"
              placeholder={`Вариант ${index + 1}`}
              value={option.text}
              onChange={(event) => setOption(index, { text: event.target.value })}
              style={{ flex: 1 }}
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => setOptions(options.filter((_, idx) => idx !== index))}
              disabled={options.length <= 2}
              aria-label="Удалить вариант"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          className="button secondary"
          type="button"
          onClick={() => setOptions([...options, { text: "", correct: false }])}
        >
          <Plus size={14} /> Добавить вариант
        </button>
      </div>

      <input
        className="input"
        placeholder="Объяснение после ответа (необязательно)"
        value={str(payload.explanation)}
        onChange={(event) => onChange({ explanation: event.target.value })}
      />
    </div>
  );
}

// --- Сопоставление ----------------------------------------------------------

type Pair = { left: string; right: string };

function MatchingEditor({ payload, onChange }: { payload: Record<string, unknown>; onChange: PatchFn }) {
  const pairs: Pair[] =
    (payload.pairs as Pair[])?.map((pair) => ({ left: str(pair?.left), right: str(pair?.right) })) ?? [];

  function setPairs(next: Pair[]) {
    onChange({ pairs: next });
  }
  function setPair(index: number, patch: Partial<Pair>) {
    setPairs(pairs.map((pair, idx) => (idx === index ? { ...pair, ...patch } : pair)));
  }

  return (
    <div className="form" style={{ gap: 8 }}>
      <input
        className="input"
        placeholder="Инструкция (необязательно)"
        value={str(payload.instruction)}
        onChange={(event) => onChange({ instruction: event.target.value })}
      />
      <div className="stack-list">
        {pairs.map((pair, index) => (
          <div className="doc-pair-row" key={index}>
            <input
              className="input"
              placeholder="Слева"
              value={pair.left}
              onChange={(event) => setPair(index, { left: event.target.value })}
            />
            <span className="doc-pair-link" aria-hidden>
              ↔
            </span>
            <input
              className="input"
              placeholder="Справа (верная пара)"
              value={pair.right}
              onChange={(event) => setPair(index, { right: event.target.value })}
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => setPairs(pairs.filter((_, idx) => idx !== index))}
              disabled={pairs.length <= 2}
              aria-label="Удалить пару"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          className="button secondary"
          type="button"
          onClick={() => setPairs([...pairs, { left: "", right: "" }])}
        >
          <Plus size={14} /> Добавить пару
        </button>
      </div>
    </div>
  );
}
