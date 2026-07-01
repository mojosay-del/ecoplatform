import type { ContentBlockKind } from "@ecoplatform/shared";

// Соответствие «атомарных» (нетекстовых) блоков именам узлов TipTap.
//
// Текстовые блоки (heading / subheading / paragraph) НЕ атомарны: они
// раскрываются в нативные узлы TipTap (heading, paragraph, списки, цитата)
// и обрабатываются сериализатором отдельно. Остальные блоки — атомарные
// «листья»: редактируются через node-view, а в документе хранят весь свой
// payload в одном атрибуте, что гарантирует round-trip без потерь.
export const ATOMIC_BLOCK_NODE_NAME = {
  image: "imageBlock",
  gallery: "galleryBlock",
  video: "videoBlock",
  audio: "audioBlock",
  file: "fileBlock",
  checklist: "checklistBlock",
  image_checklist: "imageChecklistBlock",
  lesson_tasks: "lessonTasksBlock",
  quiz: "quizBlock",
  matching: "matchingBlock",
} as const satisfies Partial<Record<ContentBlockKind, string>>;

export type AtomicBlockKind = keyof typeof ATOMIC_BLOCK_NODE_NAME;
export type AtomicBlockNodeName = (typeof ATOMIC_BLOCK_NODE_NAME)[AtomicBlockKind];

export const NODE_NAME_TO_ATOMIC_KIND: Record<string, AtomicBlockKind> = Object.fromEntries(
  Object.entries(ATOMIC_BLOCK_NODE_NAME).map(([kind, node]) => [node, kind as AtomicBlockKind]),
) as Record<string, AtomicBlockKind>;

export const ATOMIC_BLOCK_KINDS = Object.keys(ATOMIC_BLOCK_NODE_NAME) as AtomicBlockKind[];

export function isAtomicBlockKind(kind: string): kind is AtomicBlockKind {
  return kind in ATOMIC_BLOCK_NODE_NAME;
}

// Узлы верхнего уровня TipTap, которые относятся к «текстовому» блоку:
// при сохранении их непрерывный участок склеивается в один paragraph-блок
// (HTML). Совпадает с тем, что разрешает санитайзер абзацев. Таблица — тоже
// top-level узел: её HTML (<table>…) хранится в том же paragraph-блоке.
export const RICH_TEXT_TOP_LEVEL_TYPES = new Set<string>([
  "paragraph",
  "bulletList",
  "orderedList",
  "blockquote",
  "table",
]);
