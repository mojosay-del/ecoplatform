import DOMPurify from "isomorphic-dompurify";

// Whitelist должен совпадать с тем, что разрешено на стороне web/lib/sanitize-html.ts.
// Сервер чистит входящий html ещё до сохранения, чтобы в БД не лежали потенциально
// опасные конструкции (на случай прямого хождения в API мимо нашего редактора).
const PARAGRAPH_CONFIG = {
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
