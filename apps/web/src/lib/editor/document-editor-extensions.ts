import type { Extensions } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import type { AtomicBlockKind } from "./block-mapping";
import { createRichTextExtensions } from "./rich-text-extensions";
import { createSlashCommand, type SlashCommandStyles } from "./slash-command";

export type DocumentEditorExtensionsOptions = {
  allowedAtomicKinds: AtomicBlockKind[];
  atomicBlockNodes: Extensions;
  placeholder?: string;
  slashCommandStyles: SlashCommandStyles;
};

export function createDocumentEditorExtensions({
  allowedAtomicKinds,
  atomicBlockNodes,
  placeholder,
  slashCommandStyles,
}: DocumentEditorExtensionsOptions): Extensions {
  return [
    ...createRichTextExtensions(),
    Placeholder.configure({ placeholder: placeholder ?? "Начните писать или нажмите «/» для вставки блока…" }),
    ...atomicBlockNodes,
    createSlashCommand(allowedAtomicKinds, slashCommandStyles),
  ];
}
