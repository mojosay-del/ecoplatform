import type { Block } from "../../../lib/editor/block-types";

export type Attachment = { fileId: string; displayName: string };

export type LessonDraft = {
  title: string;
  blocks: Block[];
  attachments: Attachment[];
};

export type Lesson = {
  id: string;
  chapterId: string;
  title: string;
  position: number;
  status: "draft" | "published";
  blocks: Block[];
  attachments: Attachment[];
};

export type Chapter = {
  id: string;
  moduleId: string;
  title: string;
  position: number;
  lessons: Lesson[];
};

export type Preview = { promotionalDescription: string; whatYouWillLearn: string[] };

export type LearningModule = {
  id: string;
  title: string;
  summary: string;
  description: string;
  coverImageId: string | null;
  accessLevel: "basic" | "extended" | "one_time";
  oneTimePrice: number | null;
  isInDevelopment: boolean;
  status: "draft" | "published";
  preview: Preview | null;
  chapters: Chapter[];
};

export type ViewState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

export type Selection =
  | { kind: "none" }
  | { kind: "module"; id: string }
  | { kind: "chapter"; id: string }
  | { kind: "lesson"; id: string };

export type EducationMutation = (path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<boolean>;

export type SetEducationSelection = (selection: Selection) => void;
