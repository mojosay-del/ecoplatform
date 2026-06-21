"use client";

import { useEffect, useMemo, useRef } from "react";
import { useEditor, type Editor } from "@tiptap/react";
import { ATOMIC_BLOCK_KINDS, type AtomicBlockKind } from "../../lib/editor/block-mapping";
import { createDocumentEditorExtensions } from "../../lib/editor/document-editor-extensions";
import type { SlashCommandStyles } from "../../lib/editor/slash-command";
import { blocksToDoc, docToBlocks, type EditorBlock } from "../../lib/editor/serializer";
import { atomicBlockNodes } from "./atomic-nodes";
import styles from "./document-editor.module.css";

export type UseDocumentEditorOptions = {
  blocks: EditorBlock[];
  onChange: (blocks: EditorBlock[]) => void;
  allowedAtomicKinds?: AtomicBlockKind[];
  placeholder?: string;
};

const slashCommandStyles = {
  slashMenu: styles.slashMenu!,
  slashEmpty: styles.slashEmpty!,
  slashItem: styles.slashItem!,
  slashItemActive: styles.slashItemActive!,
  slashItemIcon: styles.slashItemIcon!,
  slashItemTitle: styles.slashItemTitle!,
  slashPopup: styles.slashPopup!,
} satisfies SlashCommandStyles;

export function useDocumentEditor({
  blocks,
  onChange,
  allowedAtomicKinds = ATOMIC_BLOCK_KINDS,
  placeholder,
}: UseDocumentEditorOptions): Editor | null {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Последнее, что редактор сам отдал наружу — чтобы внешние setBlocks от того
  // же значения не дёргали setContent (и не сбрасывали курсор).
  const lastEmittedRef = useRef<string>(JSON.stringify(blocks));

  const extensions = useMemo(
    () =>
      createDocumentEditorExtensions({
        allowedAtomicKinds,
        atomicBlockNodes,
        placeholder,
        slashCommandStyles,
      }),
    [allowedAtomicKinds, placeholder],
  );

  const editor = useEditor({
    extensions,
    content: blocksToDoc(blocks),
    immediatelyRender: false,
    editorProps: { attributes: { class: `${styles.content} rich-text-content` } },
    onUpdate({ editor }) {
      const next = docToBlocks(editor.getJSON());
      lastEmittedRef.current = JSON.stringify(next);
      onChangeRef.current(next);
    },
  });

  // Внешняя замена blocks (открыли другой урок/новость) — пересинхронизируем.
  useEffect(() => {
    if (!editor) return;
    const incoming = JSON.stringify(blocks);
    if (incoming === lastEmittedRef.current) return;
    editor.commands.setContent(blocksToDoc(blocks), { emitUpdate: false });
    lastEmittedRef.current = incoming;
  }, [editor, blocks]);

  return editor;
}
