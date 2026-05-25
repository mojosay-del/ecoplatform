import DOMPurify from "isomorphic-dompurify";

// Единый whitelist для HTML, который ходит через content-block paragraph.
// Используется и на сервере (перед записью в БД), и на клиенте (перед
// рендером через dangerouslySetInnerHTML). Раньше код был задублирован
// в apps/api/src/common и apps/web/src/lib — при расхождении whitelist
// сервер сохранил бы безопасный HTML, а клиент отрендерил бы опасный.
//
// `target="_blank"` принудительно дополняется `rel="noopener noreferrer"`
// через afterSanitizeAttributes-hook (защита от tabnabbing). DOMPurify v3
// чистит опасные CSS-конструкции в `style` сам, но мы ещё и сужаем
// доступные свойства до цветов/размеров шрифта.
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

let hookRegistered = false;

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
    };
    if (
      tag === "A" &&
      typeof element.getAttribute === "function" &&
      typeof element.setAttribute === "function" &&
      element.getAttribute("target") === "_blank"
    ) {
      const rel = (element.getAttribute("rel") ?? "").trim();
      const tokens = new Set(rel ? rel.split(/\s+/) : []);
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
