import type { AtomicBlockKind } from "../../../lib/editor/block-mapping";
import type { DraftState } from "./types";
import { defaultKnowledgeDisplayIconName } from "../../knowledge-base-icons";

export const KNOWLEDGE_CATEGORY_ICON_TYPE = "category";
export const UNCATEGORIZED_GROUP_ID = "__knowledge_uncategorized__";

export const EMPTY_MATERIAL_DRAFT: DraftState = {
  kind: "material",
  id: null,
  parentId: null,
  title: "",
  subtitle: "",
  coverImageId: "",
  iconType: "",
  displayIcon: defaultKnowledgeDisplayIconName("material"),
  position: 0,
  blocks: [],
};

export const EMPTY_CATEGORY_DRAFT: DraftState = {
  kind: "category",
  id: null,
  parentId: null,
  title: "",
  subtitle: "",
  coverImageId: "",
  iconType: KNOWLEDGE_CATEGORY_ICON_TYPE,
  displayIcon: defaultKnowledgeDisplayIconName("category"),
  position: 0,
  blocks: [],
};

// Атомарные блоки для базы знаний: всё, кроме урок-специфичных
// lesson_tasks/quiz/matching. Текстовые блоки всегда доступны.
export const KNOWLEDGE_ATOMIC_KINDS: AtomicBlockKind[] = [
  "image",
  "gallery",
  "video",
  "audio",
  "file",
  "checklist",
  "image_checklist",
];
