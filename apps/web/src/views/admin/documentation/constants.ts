import type { AtomicBlockKind } from "../../../lib/editor/block-mapping";
import { defaultDocumentationDisplayIconName } from "../../documentation-icons";
import type { DocDraftState } from "./types";

export const DOC_CATEGORY_ICON_TYPE = "category";
export const UNCATEGORIZED_GROUP_ID = "__documentation_uncategorized__";

export const EMPTY_DOCUMENT_DRAFT: DocDraftState = {
  kind: "document",
  id: null,
  parentId: null,
  title: "",
  subtitle: "",
  iconType: "",
  displayIcon: "",
  position: 0,
  blocks: [],
  fileAssetId: "",
  version: "",
  effectiveDate: "",
  isPinned: false,
  markRevised: false,
};

export const EMPTY_CATEGORY_DRAFT: DocDraftState = {
  ...EMPTY_DOCUMENT_DRAFT,
  kind: "category",
  iconType: DOC_CATEGORY_ICON_TYPE,
  displayIcon: defaultDocumentationDisplayIconName(),
};

// Атомарные блоки описания документа — те же, что в базе знаний (всё, кроме
// урок-специфичных). Текстовые блоки доступны всегда.
export const DOCUMENTATION_ATOMIC_KINDS: AtomicBlockKind[] = [
  "image",
  "gallery",
  "video",
  "audio",
  "file",
  "checklist",
  "image_checklist",
];

// Допустимые расширения прикреплённого файла документа.
export const DOCUMENT_FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.rtf,.zip,.rar,.odt,.ods,.odp";
