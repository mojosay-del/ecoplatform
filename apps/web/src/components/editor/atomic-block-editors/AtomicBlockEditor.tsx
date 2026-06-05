"use client";

import type { AtomicBlockKind } from "../../../lib/editor/block-mapping";
import {
  AudioPayloadEditor,
  FilePayloadEditor,
  GalleryEditor,
  ImagePayloadEditor,
  VideoPayloadEditor,
} from "./media-editors";
import { ChecklistEditor, ImageChecklistEditor, LessonTasksEditor } from "./list-editors";
import { MatchingEditor } from "./matching-editor";
import { QuizEditor } from "./quiz-editor";
import type { Img, PatchFn } from "./types";

// Редакторы содержимого (payload) атомарных блоков. Используются внутри
// node-view редактора (atomic-nodes.tsx). Каждый получает текущий payload и
// onChange(patch) — частичное слияние выполняет node-view.

export function AtomicBlockEditor({
  kind,
  payload,
  onChange,
}: {
  kind: AtomicBlockKind;
  payload: Record<string, unknown>;
  onChange: PatchFn;
}) {
  switch (kind) {
    case "image":
      return <ImagePayloadEditor payload={payload} onChange={onChange} />;
    case "video":
      return <VideoPayloadEditor payload={payload} onChange={onChange} />;
    case "audio":
      return <AudioPayloadEditor payload={payload} onChange={onChange} />;
    case "file":
      return <FilePayloadEditor payload={payload} onChange={onChange} />;
    case "gallery":
      return <GalleryEditor images={(payload.images as Img[]) ?? []} onChange={(images) => onChange({ images })} />;
    case "checklist":
      return <ChecklistEditor payload={payload} onChange={onChange} />;
    case "image_checklist":
      return <ImageChecklistEditor payload={payload} onChange={onChange} />;
    case "lesson_tasks":
      return <LessonTasksEditor tasks={(payload.tasks as Img[]) ?? []} onChange={(tasks) => onChange({ tasks })} />;
    case "quiz":
      return <QuizEditor payload={payload} onChange={onChange} />;
    case "matching":
      return <MatchingEditor payload={payload} onChange={onChange} />;
  }
}
