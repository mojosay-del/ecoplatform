import type { Attachment, Chapter, LearningModule, Lesson, LessonDraft } from "./types";

export function normalizeAttachments(attachments: Attachment[]) {
  return attachments
    .map((attachment) => ({
      fileId: attachment.fileId.trim(),
      displayName: attachment.displayName.trim(),
    }))
    .filter((attachment) => attachment.fileId && attachment.displayName);
}

export function lessonToDraft(lesson: Lesson): LessonDraft {
  return {
    title: lesson.title,
    blocks: lesson.blocks.map((block) => ({ type: block.type, payload: { ...block.payload } })),
    attachments: lesson.attachments.map((attachment) => ({ ...attachment })),
  };
}

export function normalizeLessonDraft(draft: LessonDraft) {
  return {
    title: draft.title,
    blocks: draft.blocks.map((block) => ({ type: block.type, payload: block.payload })),
    attachments: normalizeAttachments(draft.attachments),
  };
}

export function findChapter(modules: LearningModule[], chapterId: string): Chapter | null {
  for (const module of modules) {
    const chapter = module.chapters.find((candidate) => candidate.id === chapterId);
    if (chapter) return chapter;
  }
  return null;
}

export function findLesson(modules: LearningModule[], lessonId: string): Lesson | null {
  for (const module of modules) {
    for (const chapter of module.chapters) {
      const lesson = chapter.lessons.find((candidate) => candidate.id === lessonId);
      if (lesson) return lesson;
    }
  }
  return null;
}
