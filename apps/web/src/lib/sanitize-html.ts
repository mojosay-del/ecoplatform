// Web-рендер не импортирует shared DOMPurify/JSDOM sanitizer: Next SSR может
// упаковать jsdom так, что он потеряет свои служебные CSS-файлы. API всё равно
// санитизирует HTML перед записью, а здесь держим финальный синхронный фильтр
// для render-time защиты перед dangerouslySetInnerHTML.

const ALLOWED_TAGS = new Set([
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
]);

const VOID_TAGS = new Set(["br"]);
const ALLOWED_FONT_SIZES = new Set(["13px", "16px", "18px", "22px"]);
const ALLOWED_TEXT_INDENTS = new Set(["1.5em"]);
const HEX_COLOR_RE = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const RGB_COLOR_RE =
  /^rgba?\(\s*(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;
const SAFE_HREF_RE = /^(?:https?|mailto|tel):/i;
const BLOCKED_CONTENT_RE = /<(script|style|iframe|object|embed|template)\b[\s\S]*?<\/\1\s*>/gi;
const TAG_RE = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^>]*>/g;
const ATTR_RE = /([a-zA-Z:-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/g;

export function sanitizeParagraphHtml(html: string): string {
  if (!html) return "";

  const source = html.replace(BLOCKED_CONTENT_RE, "");
  let result = "";
  let cursor = 0;

  for (const match of source.matchAll(TAG_RE)) {
    const index = match.index ?? 0;
    result += escapeHtmlText(source.slice(cursor, index));
    result += sanitizeTag(match[0]);
    cursor = index + match[0].length;
  }

  result += escapeHtmlText(source.slice(cursor));
  return result;
}

function sanitizeTag(rawTag: string): string {
  if (rawTag.startsWith("<!--") || rawTag.startsWith("<!")) return "";

  const match = rawTag.match(/^<\s*(\/)?\s*([a-z0-9]+)([\s\S]*?)\/?\s*>$/i);
  if (!match) return escapeHtmlText(rawTag);

  const isClosing = Boolean(match[1]);
  const tagName = (match[2] ?? "").toLowerCase();
  if (!ALLOWED_TAGS.has(tagName)) return "";

  if (isClosing) {
    return VOID_TAGS.has(tagName) ? "" : `</${tagName}>`;
  }

  const attributes = sanitizeAttributes(tagName, match[3] ?? "");
  return attributes ? `<${tagName} ${attributes}>` : `<${tagName}>`;
}

function sanitizeAttributes(tagName: string, rawAttributes: string): string {
  const attributes = new Map<string, string>();

  for (const match of rawAttributes.matchAll(ATTR_RE)) {
    const name = (match[1] ?? "").toLowerCase();
    const value = unquoteAttribute(match[2] ?? "").trim();

    if (name === "style") {
      const safeStyle = sanitizeStyleAttribute(value);
      if (safeStyle) attributes.set("style", safeStyle);
      continue;
    }

    if (tagName !== "a") continue;

    if (name === "href" && SAFE_HREF_RE.test(value)) {
      attributes.set("href", value);
    }
    if (name === "target" && ["_blank", "_self", "_parent", "_top"].includes(value)) {
      attributes.set("target", value);
    }
    if (name === "rel") {
      const safeRel = sanitizeRelAttribute(value);
      if (safeRel) attributes.set("rel", safeRel);
    }
  }

  if (tagName === "a" && attributes.get("target") === "_blank") {
    const tokens = new Set((attributes.get("rel") ?? "").split(/\s+/).filter(Boolean));
    tokens.delete("opener");
    tokens.add("noopener");
    tokens.add("noreferrer");
    attributes.set("rel", Array.from(tokens).join(" "));
  }

  return ["href", "target", "rel", "style"]
    .map((name) => {
      const value = attributes.get(name);
      return value ? `${name}="${escapeHtmlAttribute(value)}"` : null;
    })
    .filter((value): value is string => Boolean(value))
    .join(" ");
}

function sanitizeStyleAttribute(style: string): string {
  const allowed: string[] = [];

  for (const declaration of style.split(";")) {
    const [rawProperty, ...rawValueParts] = declaration.split(":");
    const property = rawProperty?.trim().toLowerCase();
    const value = rawValueParts.join(":").trim();

    if (property === "color" && (HEX_COLOR_RE.test(value) || RGB_COLOR_RE.test(value))) {
      allowed.push(`color: ${value}`);
    }
    if (property === "font-size" && ALLOWED_FONT_SIZES.has(value)) {
      allowed.push(`font-size: ${value}`);
    }
    if (property === "text-indent" && ALLOWED_TEXT_INDENTS.has(value)) {
      allowed.push(`text-indent: ${value}`);
    }
  }

  return allowed.join("; ");
}

function sanitizeRelAttribute(rel: string): string {
  const tokens = rel
    .split(/\s+/)
    .map((token) => token.toLowerCase())
    .filter((token) => ["noopener", "noreferrer", "nofollow"].includes(token));
  return Array.from(new Set(tokens)).join(" ");
}

function unquoteAttribute(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&(?!(?:[a-z][a-z0-9]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value).replace(/"/g, "&quot;");
}
