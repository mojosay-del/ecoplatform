import type { Block } from "../../../lib/editor/block-types";
import type { NewsAccessTier } from "@ecoplatform/shared";

export type NewsTag = {
  id: string;
  name: string;
};

export type NewsTagOption = NewsTag & {
  usageCount: number;
};

export type TagSuggestion = {
  name: string;
  usageCount?: number;
};

export type NewsItem = {
  id: string;
  title: string;
  lead: string;
  slug: string;
  status: "draft" | "published";
  coverImageId: string | null;
  accessTier: NewsAccessTier;
  pinnedInForum: boolean;
  tags: Array<{ newsTagId: string; newsTag: NewsTag }>;
  firstPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { blocks: number; comments: number; likes: number };
};

export type NewsDetail = NewsItem & {
  blocks: Block[];
};

export type ViewState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

export type DraftState = {
  id: string | null;
  title: string;
  lead: string;
  coverImageId: string;
  accessTier: NewsAccessTier;
  pinnedInForum: boolean;
  tags: string[];
  blocks: Block[];
};
