import type { Dispatch, FocusEvent, SetStateAction } from "react";
import type { Block } from "../../../lib/editor/block-types";
import type { CmsAutosaveState } from "../../../lib/cms-autosave";

export type DocFileMeta = {
  id: string;
  fileName: string;
  format: string;
  sizeBytes: number;
};

// Узел дерева документации в админке (как приходит из /admin/content/documentation).
export type DocArticle = {
  id: string;
  parentId: string | null;
  title: string;
  subtitle: string | null;
  slug: string;
  position: number;
  iconType: string | null;
  status: "draft" | "published";
  firstPublishedAt: string | null;
  revisedAt: string | null;
  isPinned: boolean;
  version: string | null;
  effectiveDate: string | null;
  file: DocFileMeta | null;
  blocks: Block[];
};

export type ViewState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";
export type DocDraftKind = "category" | "document";

export type DocDraftState = {
  kind: DocDraftKind;
  id: string | null;
  parentId: string | null;
  title: string;
  subtitle: string;
  iconType: string;
  position: number;
  blocks: Block[];
  // Поля документа (для разделов остаются пустыми).
  fileAssetId: string;
  version: string;
  effectiveDate: string; // yyyy-mm-dd для <input type="date">; "" — нет даты
  isPinned: boolean;
  markRevised: boolean;
};

export type SetDocDraft = Dispatch<SetStateAction<DocDraftState>>;

export type DocAutosaveUi = {
  autosaveState: CmsAutosaveState;
  autosaveLabel: string;
  handleAutosaveBlur: (event: FocusEvent<HTMLElement>) => void;
  isAutosaving: boolean;
};
