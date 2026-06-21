"use client";

import { EditorContent } from "@tiptap/react";
import "./rich-text-editor.css";
import { ATOMIC_BLOCK_KINDS, type AtomicBlockKind } from "../../lib/editor/block-mapping";
import type { EditorBlock } from "../../lib/editor/serializer";
import styles from "./document-editor.module.css";
import { DocumentEditorToolbar } from "./document-editor-toolbar";
import { useDocumentEditor } from "./use-document-editor";

export type DocumentEditorProps = {
  blocks: EditorBlock[];
  onChange: (blocks: EditorBlock[]) => void;
  allowedAtomicKinds?: AtomicBlockKind[];
  placeholder?: string;
};

export function DocumentEditor({
  blocks,
  onChange,
  allowedAtomicKinds = ATOMIC_BLOCK_KINDS,
  placeholder,
}: DocumentEditorProps) {
  const editor = useDocumentEditor({ blocks, onChange, allowedAtomicKinds, placeholder });

  if (!editor) return null;

  return (
    <div className={styles.root}>
      <DocumentEditorToolbar editor={editor} allowedAtomicKinds={allowedAtomicKinds} />
      <EditorContent editor={editor} className={styles.surface} />
    </div>
  );
}
