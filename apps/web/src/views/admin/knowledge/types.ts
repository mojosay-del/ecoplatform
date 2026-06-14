import type { Dispatch, FocusEvent, SetStateAction } from "react";
import type { Block } from "../../../lib/editor/block-types";
import type { CmsAutosaveState } from "../../../lib/cms-autosave";

export type Article = {
  id: string;
  parentId: string | null;
  title: string;
  subtitle: string | null;
  coverImageId: string | null;
  slug: string;
  position: number;
  iconType: string | null;
  displayIcon: string | null;
  status: "draft" | "published";
  firstPublishedAt: string | null;
  blocks: Block[];
  createdAt: string;
  updatedAt: string;
};

export type ViewState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";
export type DraftKind = "category" | "material";

export type DraftState = {
  kind: DraftKind;
  id: string | null;
  parentId: string | null;
  title: string;
  subtitle: string;
  coverImageId: string;
  iconType: string;
  displayIcon: string;
  position: number;
  blocks: Block[];
};

export type SetKnowledgeDraft = Dispatch<SetStateAction<DraftState>>;

export type KnowledgeAutosaveUi = {
  autosaveState: CmsAutosaveState;
  autosaveLabel: string;
  handleAutosaveBlur: (event: FocusEvent<HTMLElement>) => void;
  isAutosaving: boolean;
};
