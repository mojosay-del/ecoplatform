import type { JSONContent } from "@tiptap/core";
import { generateHTML, generateJSON } from "@tiptap/html";
import {
  ATOMIC_BLOCK_NODE_NAME,
  NODE_NAME_TO_ATOMIC_KIND,
  RICH_TEXT_TOP_LEVEL_TYPES,
  isAtomicBlockKind,
} from "./block-mapping";
import { sanitizeParagraphHtml } from "@ecoplatform/shared/sanitize-html";
import { richTextExtensions } from "./rich-text-extensions";

// Универсальный блок CMS — то, что хранится в БД и валидируется zod-схемами
// из @ecoplatform/shared. Формат намеренно не меняем (см. editor-direction).
export type EditorBlock = { type: string; payload: Record<string, unknown> };

/**
 * Приводит блоки к канонической форме для СРАВНЕНИЯ «черновик == сохранённое».
 *
 * Сервер при записи (content-common.service.ts) делает с payload две вещи,
 * из-за которых эхо после рефетча никогда не совпадает байт-в-байт с тем, что
 * отдал редактор, и индикатор автосейва вечно горит «Не сохранено»:
 *   1) в КАЖДЫЙ payload добавляет служебный ключ `v: 1` (версия формата);
 *   2) у paragraph прогоняет html через sanitizeParagraphHtml.
 * Поэтому здесь отбрасываем `v` у всех блоков и санитайзим html абзацев тем же
 * (единым) санитайзером. DOMPurify идемпотентен, так что вывод редактора и уже
 * санитайзенное эхо сервера сходятся к одному виду. Это форма ТОЛЬКО для
 * сравнения — на запись/рендер не влияет.
 */
export function canonicalizeBlocks(blocks: EditorBlock[]): EditorBlock[] {
  return blocks.map((block) => {
    if (block.type === "paragraph") {
      return { type: "paragraph", payload: { html: sanitizeParagraphHtml(String(block.payload.html ?? "")) } };
    }
    const { v: _v, ...rest } = block.payload as Record<string, unknown>;
    return { type: block.type, payload: rest };
  });
}

// "<p></p>" и пустые строки не должны превращаться в блок-абзац: zod требует
// непустой html, да и хранить пустой абзац незачем (как и в старом редакторе).
const EMPTY_PARAGRAPH_HTML = /^\s*(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)?$/i;

/**
 * Блоки (формат БД) → документ TipTap (ProseMirror JSON) для редактора.
 *
 * - heading/subheading → нативный узел heading (level 2/3);
 * - paragraph (богатый html) → раскрывается в реальные узлы (абзацы, списки,
 *   цитаты) через generateJSON, чтобы текст редактировался вживую;
 * - все прочие (атомарные) блоки → один узел с payload в атрибутах.
 */
export function blocksToDoc(blocks: EditorBlock[]): JSONContent {
  const content: JSONContent[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading":
        content.push(headingNode(2, String(block.payload.text ?? "")));
        break;
      case "subheading":
        content.push(headingNode(3, String(block.payload.text ?? "")));
        break;
      case "paragraph": {
        const html = String(block.payload.html ?? "");
        const parsed = html ? generateJSON(html, richTextExtensions) : null;
        const nodes = parsed?.content ?? [];
        if (nodes.length > 0) {
          content.push(...nodes);
        } else {
          content.push({ type: "paragraph" });
        }
        break;
      }
      default:
        if (isAtomicBlockKind(block.type)) {
          content.push({ type: ATOMIC_BLOCK_NODE_NAME[block.type], attrs: { payload: block.payload } });
        }
        // Неизвестные типы тихо пропускаем — это форвард-совместимость.
        break;
    }
  }

  if (content.length === 0) {
    content.push({ type: "paragraph" });
  }

  return { type: "doc", content };
}

/**
 * Документ TipTap → блоки (формат БД) для сохранения.
 *
 * Непрерывный участок текстовых узлов (абзацы/списки/цитаты) склеивается в
 * ОДИН paragraph-блок: рендер читателю при этом не меняется, а формат остаётся
 * прежним. Заголовки и атомарные блоки разрывают такой участок.
 */
export function docToBlocks(doc: JSONContent): EditorBlock[] {
  const blocks: EditorBlock[] = [];
  let buffer: JSONContent[] = [];

  const flush = () => {
    if (buffer.length === 0) return;
    const html = generateHTML({ type: "doc", content: buffer }, richTextExtensions);
    buffer = [];
    if (!EMPTY_PARAGRAPH_HTML.test(html)) {
      blocks.push({ type: "paragraph", payload: { html } });
    }
  };

  for (const node of doc.content ?? []) {
    const type = node.type ?? "";

    if (type === "heading") {
      flush();
      const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
      const text = collectText(node).trim();
      if (text) {
        blocks.push({ type: level >= 3 ? "subheading" : "heading", payload: { text } });
      }
      continue;
    }

    if (RICH_TEXT_TOP_LEVEL_TYPES.has(type)) {
      buffer.push(node);
      continue;
    }

    const atomicKind = NODE_NAME_TO_ATOMIC_KIND[type];
    if (atomicKind) {
      flush();
      const payload = (node.attrs?.payload as Record<string, unknown>) ?? {};
      blocks.push({ type: atomicKind, payload });
      continue;
    }

    // Неизвестный узел — игнорируем.
  }

  flush();
  return blocks;
}

function headingNode(level: number, text: string): JSONContent {
  const node: JSONContent = { type: "heading", attrs: { level } };
  if (text) {
    node.content = [{ type: "text", text }];
  }
  return node;
}

function collectText(node: JSONContent): string {
  if (typeof node.text === "string") return node.text;
  if (!node.content) return "";
  return node.content.map(collectText).join("");
}
