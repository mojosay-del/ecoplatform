import DOMPurify from "isomorphic-dompurify";

// Единый whitelist для HTML, который ходит через content-block paragraph.
// Используется и на сервере (перед записью в БД), и на клиенте (перед
// рендером через dangerouslySetInnerHTML). Раньше код был задублирован
// в apps/api/src/common и apps/web/src/lib — при расхождении whitelist
// сервер сохранил бы безопасный HTML, а клиент отрендерил бы опасный.
//
// `target="_blank"` принудительно дополняется `rel="noopener noreferrer"`
// через afterSanitizeAttributes-hook (защита от tabnabbing). `style` оставлен
// только ради rich-text форматирования; этот же hook сужает CSS до
// цветов/размеров шрифта.
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
  ADD_URI_SAFE_ATTR: ["target", "rel"],
  ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel):/i,
};

const ALLOWED_FONT_SIZES = new Set(["13px", "16px", "18px", "22px"]);
const HEX_COLOR_RE = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const RGB_COLOR_RE =
  /^rgba?\(\s*(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])\s*,\s*(?:\d|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i;

let hookRegistered = false;

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
  }

  return allowed.join("; ");
}

function ensureHook(): void {
  if (hookRegistered) return;
  // Hook регистрируется один раз глобально. У DOMPurify нет «локального»
  // hook для одной операции — `removeHook` обнулил бы поведение в других
  // вызовах. Поэтому ставим глобально и держим идемпотентно.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    // `instanceof Element` не работает в Node без DOM polyfill (isomorphic-dompurify
    // на сервере даёт linkedom-узлы, у которых нет глобального `Element`).
    // Проверяем по тэгу через `nodeName` — это работает и в JSDOM, и в linkedom, и в браузере.
    const tag = (node as { nodeName?: string }).nodeName;
    const element = node as {
      nodeName?: string;
      getAttribute?: (name: string) => string | null;
      setAttribute?: (name: string, value: string) => void;
      removeAttribute?: (name: string) => void;
    };

    if (
      typeof element.getAttribute === "function" &&
      typeof element.setAttribute === "function" &&
      typeof element.removeAttribute === "function"
    ) {
      const style = element.getAttribute("style");
      if (style !== null) {
        const safeStyle = sanitizeStyleAttribute(style);
        if (safeStyle) {
          element.setAttribute("style", safeStyle);
        } else {
          element.removeAttribute("style");
        }
      }
    }

    if (
      tag === "A" &&
      typeof element.getAttribute === "function" &&
      typeof element.setAttribute === "function" &&
      element.getAttribute("target") === "_blank"
    ) {
      const rel = (element.getAttribute("rel") ?? "").trim();
      const tokens = new Set(rel ? rel.split(/\s+/) : []);
      tokens.delete("opener");
      tokens.add("noopener");
      tokens.add("noreferrer");
      element.setAttribute("rel", Array.from(tokens).join(" "));
    }
  });
  hookRegistered = true;
}

export function sanitizeParagraphHtml(html: string): string {
  if (!html) return "";
  ensureHook();
  return DOMPurify.sanitize(html, PARAGRAPH_CONFIG) as string;
}
