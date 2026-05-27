"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckSquare,
  ClipboardList,
  FileAudio,
  FileText,
  GripVertical,
  Heading1,
  Heading2,
  Image as ImageIcon,
  Images,
  ListChecks,
  Paperclip,
  Plus,
  Trash2,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { FileUploadField } from "./FileUploadField";
import { RichTextEditor } from "./RichTextEditor";

// Универсальный композитор контентных блоков.
// Поддерживает типы, описанные в shared/content-blocks.
// Через allowedKinds родитель ограничивает выбор (новости — без чек-листов,
// уроки — со своим блоком заданий, но без audio/file).

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
  | "image_checklist"
  | "lesson_tasks";

export type Block = { type: BlockKind; payload: Record<string, unknown> };
export type BlockInsertExtraOption = { id: string; label: string; icon: React.ReactNode; onPick: () => void };

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
  "lesson_tasks",
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
  lesson_tasks: "Задания урока",
};

const KIND_ICONS: Record<BlockKind, React.ReactNode> = {
  heading: <Heading1 size={16} />,
  subheading: <Heading2 size={16} />,
  paragraph: <FileText size={16} />,
  image: <ImageIcon size={16} />,
  gallery: <Images size={16} />,
  video: <VideoIcon size={16} />,
  audio: <FileAudio size={16} />,
  file: <Paperclip size={16} />,
  checklist: <CheckSquare size={16} />,
  image_checklist: <ListChecks size={16} />,
  lesson_tasks: <ClipboardList size={16} />,
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
      return { html: "" };
    case "image":
      return { fileId: "", caption: "", altText: "" };
    case "gallery":
      return { images: [] };
    case "video":
      return { fileId: "", rutubeUrl: "", caption: "" };
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
    case "lesson_tasks":
      return { tasks: [{ title: "", description: "" }] };
  }
}

let idCounter = 0;
function makeBlockId() {
  idCounter += 1;
  return `block-${idCounter}-${Date.now().toString(36)}`;
}

export function BlocksEditor({
  blocks,
  onChange,
  allowedKinds = ALL_BLOCK_KINDS,
  extraInsertOptions = [],
}: {
  blocks: Block[];
  onChange: (next: Block[]) => void;
  allowedKinds?: BlockKind[];
  extraInsertOptions?: BlockInsertExtraOption[];
}) {
  // Поддерживаем параллельный массив стабильных id для dnd-kit. При внешней
  // замене blocks (например, после сохранения) длину синхронизируем.
  const [ids, setIds] = useState<string[]>(() => blocks.map(() => makeBlockId()));
  useEffect(() => {
    if (ids.length !== blocks.length) {
      setIds((prev) => {
        if (blocks.length > prev.length) {
          return [
            ...prev,
            ...Array(blocks.length - prev.length)
              .fill(0)
              .map(() => makeBlockId()),
          ];
        }
        return prev.slice(0, blocks.length);
      });
    }
  }, [blocks.length, ids.length]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const addOptions = useMemo(() => allowedKinds, [allowedKinds]);

  function update(index: number, patch: Record<string, unknown>) {
    const next = blocks.map((block, idx) =>
      idx === index ? { ...block, payload: { ...block.payload, ...patch } } : block,
    );
    onChange(next);
  }

  function remove(index: number) {
    const next = blocks.filter((_, idx) => idx !== index);
    setIds((prev) => prev.filter((_, idx) => idx !== index));
    onChange(next);
  }

  function insertAt(index: number, kind: BlockKind) {
    const newBlock: Block = { type: kind, payload: defaultPayload(kind) };
    const next = [...blocks.slice(0, index), newBlock, ...blocks.slice(index)];
    setIds((prev) => [...prev.slice(0, index), makeBlockId(), ...prev.slice(index)]);
    onChange(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    setIds((prev) => arrayMove(prev, from, to));
    onChange(arrayMove(blocks, from, to));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="blocks-editor">
          {blocks.length === 0 ? (
            <div className="blocks-editor-empty">
              <InsertButton
                allowedKinds={addOptions}
                onPick={(kind) => insertAt(0, kind)}
                extraOptions={extraInsertOptions}
                label="Добавить блок"
                size="lg"
              />
              <span className="blocks-editor-empty-hint">
                Выберите тип первого блока — заголовок, абзац, картинку и т. д.
              </span>
            </div>
          ) : (
            <>
              <BlockInsertSlot
                allowedKinds={addOptions}
                extraOptions={extraInsertOptions}
                onPick={(kind) => insertAt(0, kind)}
              />
              {blocks.map((block, index) => (
                <div key={ids[index]}>
                  <SortableBlock
                    id={ids[index]!}
                    block={block}
                    onUpdate={(patch) => update(index, patch)}
                    onDelete={() => remove(index)}
                  />
                  <BlockInsertSlot
                    allowedKinds={addOptions}
                    extraOptions={extraInsertOptions}
                    onPick={(kind) => insertAt(index + 1, kind)}
                  />
                </div>
              ))}
            </>
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableBlock({
  id,
  block,
  onUpdate,
  onDelete,
}: {
  id: string;
  block: Block;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`block-row${isDragging ? " is-dragging" : ""}`}>
      <button type="button" className="block-row-handle" aria-label="Перетащить" {...attributes} {...listeners}>
        <GripVertical size={16} />
      </button>
      <div className="block-row-body">
        <div className="block-row-header">
          <span className="block-row-type">
            {KIND_ICONS[block.type]} {KIND_LABELS[block.type]}
          </span>
          <button
            type="button"
            className="block-row-delete"
            onClick={onDelete}
            aria-label="Удалить блок"
            title="Удалить блок"
          >
            <Trash2 size={14} />
          </button>
        </div>
        <BlockBody block={block} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

function BlockInsertSlot({
  allowedKinds,
  extraOptions,
  onPick,
}: {
  allowedKinds: BlockKind[];
  extraOptions: BlockInsertExtraOption[];
  onPick: (kind: BlockKind) => void;
}) {
  return (
    <div className="block-insert-slot">
      <InsertButton allowedKinds={allowedKinds} extraOptions={extraOptions} onPick={onPick} />
    </div>
  );
}

function InsertButton({
  allowedKinds,
  extraOptions,
  onPick,
  label = "Добавить",
  size = "sm",
}: {
  allowedKinds: BlockKind[];
  extraOptions: BlockInsertExtraOption[];
  onPick: (kind: BlockKind) => void;
  label?: string;
  size?: "sm" | "lg";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`block-insert ${size}`} ref={ref}>
      <button
        type="button"
        className={`block-insert-button${open ? " is-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={size === "lg" ? undefined : label}
      >
        <Plus size={size === "lg" ? 16 : 14} />
        {size === "lg" ? <span>{label}</span> : null}
      </button>
      {open ? (
        <div className="block-insert-menu" role="menu">
          {allowedKinds.map((kind) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className="block-insert-menu-item"
              onClick={() => {
                setOpen(false);
                onPick(kind);
              }}
            >
              <span className="block-insert-menu-icon">{KIND_ICONS[kind]}</span>
              {KIND_LABELS[kind]}
            </button>
          ))}
          {extraOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              className="block-insert-menu-item"
              onClick={() => {
                setOpen(false);
                option.onPick();
              }}
            >
              <span className="block-insert-menu-icon">{option.icon}</span>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
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
        <RichTextEditor
          value={(block.payload.html as string) ?? ""}
          onChange={(html) => onUpdate({ html })}
          placeholder="Текст абзаца"
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
            onChange={(fileId, asset) =>
              onUpdate({ fileId, altText: (block.payload.altText as string) || asset?.originalName || "" })
            }
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
          <FileUploadField
            accept="video/*"
            buttonLabel="Загрузить видео"
            label="Видеофайл"
            value={(block.payload.fileId as string) ?? ""}
            onChange={(fileId) => onUpdate({ fileId })}
          />
          <p className="page-subtitle" style={{ fontSize: 13 }}>
            Можно вместо загрузки указать ссылку на Rutube (если видео уже размещено там). Загруженный файл имеет
            приоритет.
          </p>
          <input
            className="input"
            placeholder="URL Rutube (необязательно)"
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
            onChange={(fileId, asset) =>
              onUpdate({ fileId, episodeTitle: (block.payload.episodeTitle as string) || asset?.originalName || "" })
            }
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
            onChange={(fileId, asset) =>
              onUpdate({ fileId, displayName: (block.payload.displayName as string) || asset?.originalName || "" })
            }
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
    case "lesson_tasks":
      return (
        <LessonTasksEditor
          tasks={(block.payload.tasks as Array<Record<string, unknown>>) ?? []}
          onChange={(tasks) => onUpdate({ tasks })}
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
  const [extraSlots, setExtraSlots] = useState(0);
  const filledImages = images.filter((image) => typeof image.fileId === "string" && image.fileId);
  const basePlaceholderCount = Math.max(2 - filledImages.length, 0);
  const placeholderCount = basePlaceholderCount + extraSlots;
  const slots = [
    ...filledImages,
    ...Array.from({ length: placeholderCount }, () => ({ fileId: "", caption: "", altText: "" })),
  ];
  const rows: Array<Array<{ image: Record<string, unknown>; index: number }>> = [];
  slots.forEach((image, index) => {
    const rowIndex = Math.floor(index / 3);
    rows[rowIndex] ??= [];
    rows[rowIndex]!.push({ image, index });
  });

  function updateAt(index: number, patch: Record<string, unknown>) {
    if (index < filledImages.length) {
      const nextImages = filledImages.map((image, idx) => (idx === index ? { ...image, ...patch } : image));
      onChange(nextImages.filter((image) => typeof image.fileId === "string" && image.fileId));
      return;
    }
    if (typeof patch.fileId === "string" && patch.fileId) {
      onChange([...filledImages, { fileId: "", caption: "", altText: "", ...patch }]);
      setExtraSlots((value) => Math.max(0, value - 1));
    }
  }
  function add() {
    setExtraSlots((value) => value + 1);
  }
  function remove(index: number) {
    if (index >= filledImages.length) {
      setExtraSlots((value) => Math.max(0, value - 1));
      return;
    }
    onChange(filledImages.filter((_, idx) => idx !== index));
  }
  return (
    <div className="gallery-editor">
      <div className="gallery-editor-rows">
        {rows.map((row, rowIndex) => {
          const isLastRow = rowIndex === rows.length - 1;
          const showRailAdd = isLastRow && row.length < 3;
          return (
            <div className={`gallery-editor-row${showRailAdd ? " has-add-rail" : ""}`} key={rowIndex}>
              {row.map(({ image, index }) => {
                const isPersisted = index < filledImages.length;
                const isExtraPlaceholder = !isPersisted && index >= filledImages.length + basePlaceholderCount;
                const canShowRemove = isExtraPlaceholder;
                return (
                  <div className="gallery-editor-tile" key={index}>
                    <FileUploadField
                      accept="image/*"
                      buttonLabel="Добавить изображение"
                      hideLabel
                      tile
                      value={(image.fileId as string) ?? ""}
                      onChange={(fileId, asset) =>
                        updateAt(index, { fileId, altText: (image.altText as string) || asset?.originalName || "" })
                      }
                    />
                    {isPersisted ? (
                      <>
                        <input
                          className="gallery-editor-input"
                          placeholder="Подпись"
                          value={(image.caption as string) ?? ""}
                          onChange={(event) => updateAt(index, { caption: event.target.value })}
                        />
                        <input
                          className="gallery-editor-input"
                          placeholder="Alt-текст"
                          value={(image.altText as string) ?? ""}
                          onChange={(event) => updateAt(index, { altText: event.target.value })}
                        />
                      </>
                    ) : null}
                    {canShowRemove ? (
                      <button
                        className={`gallery-editor-remove${isExtraPlaceholder ? " is-placeholder" : ""}`}
                        type="button"
                        onClick={() => remove(index)}
                        title="Убрать пустой слот"
                        aria-label="Убрать пустой слот"
                      >
                        <X size={13} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
              {showRailAdd ? (
                <button
                  className="gallery-editor-add is-rail"
                  type="button"
                  onClick={add}
                  title="Добавить изображение"
                  aria-label="Добавить изображение"
                >
                  <Plus size={18} />
                </button>
              ) : null}
            </div>
          );
        })}
        {rows[rows.length - 1]?.length === 3 ? (
          <div className="gallery-editor-row">
            <button className="gallery-editor-add is-square" type="button" onClick={add} title="Добавить изображение">
              <Plus size={18} />
              <span>Добавить изображение</span>
            </button>
          </div>
        ) : null}
      </div>
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
  onChange: (patch: { title?: string; style?: string; image?: Record<string, unknown>; items?: string[] }) => void;
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
        onChange={(fileId, asset) =>
          onChange({ image: { ...image, fileId, altText: (image.altText as string) || asset?.originalName || "" } })
        }
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

function LessonTasksEditor({
  tasks,
  onChange,
}: {
  tasks: Array<Record<string, unknown>>;
  onChange: (next: Array<Record<string, unknown>>) => void;
}) {
  const normalizedTasks = tasks.length > 0 ? tasks : [{ title: "", description: "" }];

  function updateTask(index: number, patch: Record<string, unknown>) {
    onChange(normalizedTasks.map((task, idx) => (idx === index ? { ...task, ...patch } : task)));
  }
  function addTask() {
    onChange([...normalizedTasks, { title: "", description: "" }]);
  }
  function removeTask(index: number) {
    if (normalizedTasks.length === 1) return;
    onChange(normalizedTasks.filter((_, idx) => idx !== index));
  }

  return (
    <div className="lesson-tasks-editor">
      {normalizedTasks.map((task, index) => (
        <div className="lesson-task-editor-row" key={index}>
          <span className="lesson-task-editor-index">{index + 1}</span>
          <div className="lesson-task-editor-fields">
            <input
              className="input"
              placeholder={`Задача ${index + 1}`}
              value={(task.title as string) ?? ""}
              onChange={(event) => updateTask(index, { title: event.target.value })}
            />
            <input
              className="input"
              placeholder="Подсказка под задачей (необязательно)"
              value={(task.description as string) ?? ""}
              onChange={(event) => updateTask(index, { description: event.target.value })}
            />
          </div>
          <button
            className="icon-button lesson-task-editor-remove"
            type="button"
            onClick={() => removeTask(index)}
            disabled={normalizedTasks.length === 1}
            title="Удалить задачу"
            aria-label="Удалить задачу"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button className="attachments-add" type="button" onClick={addTask}>
        <Plus size={14} /> Добавить задачу
      </button>
    </div>
  );
}
