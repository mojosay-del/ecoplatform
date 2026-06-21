"use client";

import { useCallback, useRef, useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { GripVertical, Trash2 } from "lucide-react";
import {
  ATOMIC_BLOCK_KINDS,
  ATOMIC_BLOCK_NODE_NAME,
  NODE_NAME_TO_ATOMIC_KIND,
  type AtomicBlockKind,
} from "../../lib/editor/block-mapping";
import { ATOMIC_BLOCK_ICONS, ATOMIC_BLOCK_LABELS } from "../../lib/editor/atomic-block-metadata";
import { AtomicBlockEditor } from "./atomic-block-editors";
import styles from "./document-editor.module.css";

export { ATOMIC_BLOCK_ICONS, ATOMIC_BLOCK_LABELS, atomicDefaultPayload } from "../../lib/editor/atomic-block-metadata";

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
