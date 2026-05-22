import DOMPurify from "isomorphic-dompurify";

// Whitelist для текстового абзаца: типографика + ссылки + inline-стили
// (TipTap пишет цвет/размер шрифта в style на <span>).
const PARAGRAPH_CONFIG: Parameters<typeof DOMPurify.sanitize>[1] = {
  ALLOWED_TAGS: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "del",
    "a",
    "h2",
    "h3",
    "ul",
    "ol",
    "li",
    "blockquote",
    "span",
    "code",
  ],
  ALLOWED_ATTR: ["href", "target", "rel", "style"],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
};

export function sanitizeParagraphHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, PARAGRAPH_CONFIG) as string;
}
