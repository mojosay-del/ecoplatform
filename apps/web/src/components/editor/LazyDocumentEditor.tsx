"use client";

import dynamic from "next/dynamic";
import type { DocumentEditorProps } from "./DocumentEditor";
import "./rich-text-editor.css";

const DynamicDocumentEditor = dynamic<DocumentEditorProps>(
  () => import("./DocumentEditor").then((module) => module.DocumentEditor),
  {
    ssr: false,
    loading: () => (
      <div className="rich-text-editor document-editor-loading" aria-busy="true">
        Загрузка редактора...
      </div>
    ),
  },
);

export function LazyDocumentEditor(props: DocumentEditorProps) {
  return <DynamicDocumentEditor {...props} />;
}
