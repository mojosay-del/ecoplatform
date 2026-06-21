import type { Editor } from "@tiptap/core";

const LINK_SCHEME_PATTERN = /^(https?:|mailto:|tel:|ftp:)/i;

export type LinkPromptResult = { kind: "cancel" } | { kind: "unset" } | { kind: "set"; href: string; text: string };

export function normalizeLinkHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return LINK_SCHEME_PATTERN.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function resolveLinkPromptResult(rawValue: string | null): LinkPromptResult {
  if (rawValue === null) return { kind: "cancel" };

  const text = rawValue.trim();
  if (!text) return { kind: "unset" };

  return { kind: "set", href: normalizeLinkHref(text), text };
}

export function setLinkPrompt(editor: Editor, prompt: (message: string, defaultValue: string) => string | null) {
  const previous = (editor.getAttributes("link") as { href?: string }).href ?? "";
  const result = resolveLinkPromptResult(prompt("URL ссылки", previous));

  if (result.kind === "cancel") return;

  if (result.kind === "unset") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }

  if (editor.state.selection.empty && !editor.isActive("link")) {
    editor
      .chain()
      .focus()
      .insertContent({ type: "text", text: result.text, marks: [{ type: "link", attrs: { href: result.href } }] })
      .run();
    return;
  }

  editor.chain().focus().extendMarkRange("link").setLink({ href: result.href }).run();
}
