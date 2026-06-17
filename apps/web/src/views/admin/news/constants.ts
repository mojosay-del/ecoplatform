import type { AtomicBlockKind } from "../../../lib/editor/block-mapping";
import type { DraftState } from "./types";

export const EMPTY_DRAFT: DraftState = {
  id: null,
  title: "",
  lead: "",
  coverImageId: "",
  pinnedInForum: false,
  tags: [],
  blocks: [{ type: "paragraph", payload: { html: "" } }],
};

export const NEWS_LIST_PAGE_SIZE = 20;

// Атомарные блоки для новостей (текстовые блоки всегда доступны через панель
// и меню «/»). Без чек-листов/файлов/урок-специфичных блоков.
export const NEWS_ATOMIC_KINDS: AtomicBlockKind[] = ["image", "gallery", "video", "audio"];
