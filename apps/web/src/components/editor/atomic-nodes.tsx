"use client";

import { useCallback, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import {
  CheckSquare,
  ClipboardList,
  FileAudio,
  GripVertical,
  Image as ImageIcon,
  Images,
  ListChecks,
  ListOrdered,
  Paperclip,
  Shuffle,
  Trash2,
  Video as VideoIcon,
} from "lucide-react";
import {
  ATOMIC_BLOCK_KINDS,
  ATOMIC_BLOCK_NODE_NAME,
  NODE_NAME_TO_ATOMIC_KIND,
  type AtomicBlockKind,
} from "../../lib/editor/block-mapping";
import { AtomicBlockEditor } from "./atomic-block-editors";
import styles from "./document-editor.module.css";

// Человекочитаемые подписи и иконки атомарных блоков (для шапки карточки и меню).
export const ATOMIC_BLOCK_LABELS: Record<AtomicBlockKind, string> = {
  image: "Картинка",
  gallery: "Галерея",
  video: "Видео",
  audio: "Аудио",
  file: "Файл",
  checklist: "Чек-лист",
  image_checklist: "Чек-лист с картинкой",
  lesson_tasks: "Задания урока",
  quiz: "Тест",
  matching: "Сопоставление",
};

export const ATOMIC_BLOCK_ICONS: Record<AtomicBlockKind, React.ReactNode> = {
  image: <ImageIcon size={15} />,
  gallery: <Images size={15} />,
  video: <VideoIcon size={15} />,
  audio: <FileAudio size={15} />,
  file: <Paperclip size={15} />,
  checklist: <CheckSquare size={15} />,
  image_checklist: <ListChecks size={15} />,
  lesson_tasks: <ClipboardList size={15} />,
  quiz: <ListOrdered size={15} />,
  matching: <Shuffle size={15} />,
};

// Значения по умолчанию при вставке нового блока (совпадают с zod-схемами).
export function atomicDefaultPayload(kind: AtomicBlockKind): Record<string, unknown> {
  switch (kind) {
    case "image":
      return { fileId: "", caption: "", altText: "" };
    case "gallery":
      return { images: [] };
    case "video":
      return { fileId: "", caption: "" };
    case "audio":
      return { fileId: "", episodeTitle: "", caption: "" };
    case "file":
      return { fileId: "", displayName: "", description: "" };
    case "checklist":
      return { title: "", style: "positive", items: [""] };
    case "image_checklist":
      return { title: "", style: "positive", image: { fileId: "", caption: "", altText: "" }, items: [""] };
    case "lesson_tasks":
      return { tasks: [{ title: "", description: "" }] };
    case "quiz":
      return {
        question: "",
        multiple: false,
        options: [
          { text: "", correct: false },
          { text: "", correct: false },
        ],
        explanation: "",
      };
    case "matching":
      return {
        instruction: "",
        pairs: [
          { left: "", right: "" },
          { left: "", right: "" },
        ],
      };
  }
}

// Локальное состояние payload + коммит в атрибуты узла. Локальный стейт даёт
// плавный ввод (без скачков курсора), коммит держит документ в синхроне.
// Защита от циклов: гейт по сериализованному значению. Внешние изменения
// атрибутов (undo/redo) подтягиваются обратно.
function useNodePayload(
  node: NodeViewProps["node"],
  updateAttributes: NodeViewProps["updateAttributes"],
): readonly [Record<string, unknown>, (patch: Record<string, unknown>) => void] {
  const [payload, setPayload] = useState<Record<string, unknown>>(() => ({
    ...((node.attrs.payload as Record<string, unknown>) ?? {}),
  }));
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const syncedRef = useRef(JSON.stringify(payload));

  const attrsSerialized = JSON.stringify((node.attrs.payload as Record<string, unknown>) ?? {});
  if (attrsSerialized !== syncedRef.current) {
    // Внешнее изменение (например undo) — подтягиваем во время рендера.
    syncedRef.current = attrsSerialized;
    const fromAttrs = { ...((node.attrs.payload as Record<string, unknown>) ?? {}) };
    payloadRef.current = fromAttrs;
    // setState во время рендера для синхронизации с пропсами — допустимый приём.
    setPayload(fromAttrs);
  }

  const update = useCallback(
    (patch: Record<string, unknown>) => {
      const next = { ...payloadRef.current, ...patch };
      payloadRef.current = next;
      syncedRef.current = JSON.stringify(next);
      setPayload(next);
      updateAttributes({ payload: next });
    },
    [updateAttributes],
  );

  return [payload, update] as const;
}

function AtomicNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const kind = NODE_NAME_TO_ATOMIC_KIND[node.type.name];
  const [payload, update] = useNodePayload(node, updateAttributes);
  if (!kind) return null;

  return (
    <NodeViewWrapper className={styles.block} data-kind={kind}>
      <div className={styles.blockCard} contentEditable={false}>
        <div className={styles.blockHead}>
          <span
            className={styles.blockHandle}
            data-drag-handle
            aria-label="Перетащить блок"
            role="button"
            tabIndex={-1}
          >
            <GripVertical size={15} />
          </span>
          <span className={styles.blockLabel}>
            {ATOMIC_BLOCK_ICONS[kind]}
            {ATOMIC_BLOCK_LABELS[kind]}
          </span>
          <button
            type="button"
            className={styles.blockDelete}
            onClick={() => deleteNode()}
            aria-label="Удалить блок"
            title="Удалить блок"
          >
            <Trash2 size={14} />
          </button>
        </div>
        <div className={styles.blockBody}>
          <AtomicBlockEditor kind={kind} payload={payload} onChange={update} />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function createAtomicBlockNode(kind: AtomicBlockKind) {
  const name = ATOMIC_BLOCK_NODE_NAME[kind];
  return Node.create({
    name,
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,

    addAttributes() {
      return {
        payload: {
          default: {},
          parseHTML: (element) => {
            try {
              return JSON.parse(element.getAttribute("data-payload") ?? "{}");
            } catch {
              return {};
            }
          },
          renderHTML: (attributes) => ({ "data-payload": JSON.stringify(attributes.payload ?? {}) }),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-block="${name}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-block": name })];
    },

    addNodeView() {
      return ReactNodeViewRenderer(AtomicNodeView);
    },
  });
}

// Все атомарные узлы регистрируются всегда (чтобы любой существующий контент
// открывался). Ограничение по разделам действует только в меню вставки.
export const atomicBlockNodes = ATOMIC_BLOCK_KINDS.map(createAtomicBlockNode);
