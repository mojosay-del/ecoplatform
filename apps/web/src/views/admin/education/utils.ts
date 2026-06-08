import type { Block } from "../../../lib/editor/block-types";
import type { Attachment, Chapter, LearningModule, Lesson, LessonDraft, LessonTaskDraft } from "./types";

const LESSON_TASKS_BLOCK_TYPE = "lesson_tasks";

export function normalizeAttachments(attachments: Attachment[]) {
  return attachments
    .map((attachment) => ({
      fileId: attachment.fileId.trim(),
      displayName: attachment.displayName.trim(),
    }))
    .filter((attachment) => attachment.fileId && attachment.displayName);
}

export function normalizeLessonTasks(tasks: LessonTaskDraft[]) {
  return tasks
    .map((task) => ({
      title: task.title.trim(),
      description: task.description.trim(),
    }))
    .filter((task) => task.title);
}

function extractLessonTasks(blocks: Block[]): LessonTaskDraft[] {
  return blocks.flatMap((block) => {
    if (block.type !== LESSON_TASKS_BLOCK_TYPE || !Array.isArray(block.payload.tasks)) {
      return [];
    }

    return block.payload.tasks.flatMap((rawTask) => {
      if (!rawTask || typeof rawTask !== "object") {
        return [];
      }
      const task = rawTask as Record<string, unknown>;
      const title = typeof task.title === "string" ? task.title : "";
      const description = typeof task.description === "string" ? task.description : "";
      if (!title.trim()) {
        return [];
      }
      return [{ title, description }];
    });
  });
}

function omitLessonTaskBlocks(blocks: Block[]): Block[] {
  return blocks.filter((block) => block.type !== LESSON_TASKS_BLOCK_TYPE);
}

function lessonTasksToBlock(tasks: LessonTaskDraft[]): Block | null {
  const normalizedTasks = normalizeLessonTasks(tasks);
  if (normalizedTasks.length === 0) {
    return null;
  }

  return {
    type: LESSON_TASKS_BLOCK_TYPE,
    payload: {
      tasks: normalizedTasks.map((task) => ({
        title: task.title,
        ...(task.description ? { description: task.description } : {}),
      })),
    },
  };
}

export function lessonToDraft(lesson: Lesson): LessonDraft {
  return {
    title: lesson.title,
    coverImageId: lesson.coverImageId ?? "",
    coverSubtitle: lesson.coverSubtitle ?? "",
    blocks: omitLessonTaskBlocks(lesson.blocks).map((block) => ({ type: block.type, payload: { ...block.payload } })),
    lessonTasks: extractLessonTasks(lesson.blocks),
    attachments: lesson.attachments.map((attachment) => ({ ...attachment })),
  };
}

export function normalizeLessonDraft(draft: LessonDraft) {
  const lessonTasksBlock = lessonTasksToBlock(draft.lessonTasks);
  return {
    title: draft.title,
    coverImageId: draft.coverImageId.trim() || null,
    coverSubtitle: draft.coverSubtitle.trim() || null,
    blocks: [
      ...omitLessonTaskBlocks(draft.blocks).map((block) => ({ type: block.type, payload: block.payload })),
      ...(lessonTasksBlock ? [lessonTasksBlock] : []),
    ],
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
