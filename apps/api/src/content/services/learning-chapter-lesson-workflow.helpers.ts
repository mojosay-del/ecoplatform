import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ContentStatus, Prisma } from "@prisma/client";
import { lessonBlockSchema, validateContentBlocks } from "@ecoplatform/shared";
import type { AdminActionLogService } from "../../common/admin-action-log.service";
import type { RequestUser } from "../../common/request-user";
import type { PrismaService } from "../../prisma/prisma.service";
import type { z } from "zod";
import type {
  chapterInputSchema,
  chapterUpdateInputSchema,
  lessonInputSchema,
  lessonUpdateInputSchema,
} from "../content.schemas";
import type { ContentCommonService } from "./content-common.service";
import { refreshLearningModuleFileReferences } from "./learning-file-references.helpers";
import { repositionChapter, repositionLesson } from "./learning-position.helpers";

type ChapterInput = z.infer<typeof chapterInputSchema>;
type ChapterUpdateInput = z.infer<typeof chapterUpdateInputSchema>;
type LessonInput = z.infer<typeof lessonInputSchema>;
type LessonUpdateInput = z.infer<typeof lessonUpdateInputSchema>;

type LearningChapterLessonWorkflowDeps = {
  prisma: PrismaService;
  auditLog: AdminActionLogService;
  common: ContentCommonService;
};

export async function createChapter(
  { prisma, auditLog }: LearningChapterLessonWorkflowDeps,
  moduleId: string,
  input: ChapterInput,
  user: RequestUser,
) {
  const moduleExists = await prisma.learningModule.findUnique({
    where: { id: moduleId },
    select: { id: true },
  });
  if (!moduleExists) {
    throw new NotFoundException("Модуль не найден.");
  }

  const chapter = await prisma.chapter.create({
    data: {
      moduleId,
      title: input.title,
      position: input.position,
      createdById: user.id,
    },
  });

  await auditLog.record({
    actorId: user.id,
    action: "learning.chapter.create",
    entityType: "Chapter",
    entityId: chapter.id,
    payload: { moduleId },
  });

  return chapter;
}

export async function updateChapter(
  { prisma, auditLog }: LearningChapterLessonWorkflowDeps,
  id: string,
  input: ChapterUpdateInput,
  user: RequestUser,
) {
  const existing = await prisma.chapter.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException("Глава не найдена.");
  }

  const positionChanged = input.position !== undefined && input.position !== existing.position;

  const chapter = await prisma.$transaction(async (tx) => {
    if (positionChanged) {
      await repositionChapter(tx, existing.moduleId, id, input.position!);
    }
    const data: Prisma.ChapterUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (Object.keys(data).length === 0 && !positionChanged) {
      return existing;
    }
    return tx.chapter.update({ where: { id }, data });
  });

  await auditLog.record({
    actorId: user.id,
    action: "learning.chapter.update",
    entityType: "Chapter",
    entityId: id,
    payload: input,
  });

  return chapter;
}

export async function deleteChapter(
  { prisma, auditLog }: LearningChapterLessonWorkflowDeps,
  id: string,
  user: RequestUser,
  reason?: string,
) {
  const existing = await prisma.chapter.findUnique({
    where: { id },
    include: { _count: { select: { lessons: true } } },
  });
  if (!existing) {
    throw new NotFoundException("Глава не найдена.");
  }
  if (existing._count.lessons > 0) {
    throw new ForbiddenException("Нельзя удалить главу с уроками.");
  }

  await prisma.chapter.delete({ where: { id } });

  await auditLog.record({
    actorId: user.id,
    action: "learning.chapter.delete",
    entityType: "Chapter",
    entityId: id,
    comment: reason,
    payload: { title: existing.title, moduleId: existing.moduleId },
  });

  return { ok: true };
}

export async function createLesson(
  { prisma, auditLog, common }: LearningChapterLessonWorkflowDeps,
  chapterId: string,
  input: LessonInput,
  user: RequestUser,
) {
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) {
    throw new NotFoundException("Глава не найдена.");
  }

  if (input.blocks.length > 0) {
    const check = validateContentBlocks(input.blocks, lessonBlockSchema);
    if (!check.ok) {
      throw new ForbiddenException(check.message);
    }
  }
  await common.assertCoverImageAllowed(input.coverImageId, user);

  const lesson = await prisma.lesson.create({
    data: {
      chapterId,
      title: input.title,
      coverImageId: input.coverImageId,
      coverSubtitle: input.coverSubtitle,
      position: input.position,
      createdById: user.id,
      blocks: {
        create: input.blocks.map((block, position) => ({
          position,
          type: block.type,
          payload: common.payload(block),
        })),
      },
      attachments: {
        create: input.attachments.map((attachment, position) => ({
          fileId: attachment.fileId,
          displayName: attachment.displayName,
          position,
        })),
      },
    },
  });

  await refreshLearningModuleFileReferences(prisma, common, chapter.moduleId);

  await auditLog.record({
    actorId: user.id,
    action: "learning.lesson.create",
    entityType: "Lesson",
    entityId: lesson.id,
    payload: { chapterId },
  });

  return lesson;
}

export async function updateLesson(
  { prisma, auditLog, common }: LearningChapterLessonWorkflowDeps,
  id: string,
  input: LessonUpdateInput,
  user: RequestUser,
) {
  const existing = await prisma.lesson.findUnique({
    where: { id },
    include: { blocks: true, attachments: true },
  });
  if (!existing) {
    throw new NotFoundException("Урок не найден.");
  }

  if (input.blocks) {
    if (input.blocks.length === 0 && existing.status === ContentStatus.published) {
      throw new ForbiddenException("Нельзя оставить опубликованный урок без блоков.");
    }
    if (input.blocks.length > 0) {
      const check = validateContentBlocks(input.blocks, lessonBlockSchema);
      if (!check.ok) {
        throw new ForbiddenException(check.message);
      }
    }
  }
  if (input.coverImageId !== undefined) {
    await common.assertCoverImageAllowed(input.coverImageId, user);
  }

  const positionChanged = input.position !== undefined && input.position !== existing.position;
  const previousFileIds = common.compactFileIds([
    ...(input.coverImageId !== undefined ? [existing.coverImageId] : []),
    ...(input.blocks ? common.collectFileIdsFromBlocks(existing.blocks) : []),
    ...(input.attachments ? existing.attachments.map((attachment) => attachment.fileId) : []),
  ]);

  const lesson = await prisma.$transaction(async (tx) => {
    if (positionChanged) {
      await repositionLesson(tx, existing.chapterId, id, input.position!);
    }

    const data: Prisma.LessonUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.coverImageId !== undefined) data.coverImageId = input.coverImageId;
    if (input.coverSubtitle !== undefined) data.coverSubtitle = input.coverSubtitle;

    if (input.blocks) {
      await tx.lessonContentBlock.deleteMany({ where: { lessonId: id } });
      data.blocks = {
        create: input.blocks.map((block, position) => ({
          position,
          type: block.type,
          payload: common.payload(block),
        })),
      };
    }

    if (input.attachments) {
      await tx.lessonAttachment.deleteMany({ where: { lessonId: id } });
      data.attachments = {
        create: input.attachments.map((attachment, position) => ({
          fileId: attachment.fileId,
          displayName: attachment.displayName,
          position,
        })),
      };
    }

    return tx.lesson.update({ where: { id }, data });
  });

  // Перепрожимаем references модуля под актуальный состав файлов всех уроков,
  // потом удаляем осиротевшие — порядок важен, чтобы FileReference не блокировал
  // удаление файла, которого больше нет в новом списке.
  const chapter = await prisma.chapter.findUnique({
    where: { id: existing.chapterId },
    select: { moduleId: true },
  });
  if (chapter) {
    await refreshLearningModuleFileReferences(prisma, common, chapter.moduleId);
  }

  await auditLog.record({
    actorId: user.id,
    action: "learning.lesson.update",
    entityType: "Lesson",
    entityId: id,
  });

  await common.cleanupDetachedFiles(previousFileIds);

  return lesson;
}

export async function deleteLesson(
  { prisma, auditLog, common }: LearningChapterLessonWorkflowDeps,
  id: string,
  user: RequestUser,
  reason?: string,
) {
  const existing = await prisma.lesson.findUnique({
    where: { id },
    include: { blocks: true, attachments: true },
  });
  if (!existing) {
    throw new NotFoundException("Урок не найден.");
  }

  const deletedFileIds = common.compactFileIds([
    existing.coverImageId,
    ...common.collectFileIdsFromBlocks(existing.blocks),
    ...existing.attachments.map((attachment) => attachment.fileId),
  ]);

  const chapter = await prisma.chapter.findUnique({
    where: { id: existing.chapterId },
    select: { moduleId: true },
  });
  await prisma.lesson.delete({ where: { id } });
  if (chapter) {
    await refreshLearningModuleFileReferences(prisma, common, chapter.moduleId);
  }
  await common.cleanupDetachedFiles(deletedFileIds);

  await auditLog.record({
    actorId: user.id,
    action: "learning.lesson.delete",
    entityType: "Lesson",
    entityId: id,
    comment: reason,
    payload: { title: existing.title, chapterId: existing.chapterId },
  });

  return { ok: true };
}

export async function unpublishLesson(
  { prisma, auditLog }: LearningChapterLessonWorkflowDeps,
  id: string,
  user: RequestUser,
  reason?: string,
) {
  const existing = await prisma.lesson.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException("Урок не найден.");
  }

  const lesson = await prisma.lesson.update({
    where: { id },
    data: { status: ContentStatus.draft },
  });

  await auditLog.record({
    actorId: user.id,
    action: "learning.lesson.unpublish",
    entityType: "Lesson",
    entityId: id,
    comment: reason,
  });

  return lesson;
}

export async function publishLesson(
  { prisma, auditLog }: LearningChapterLessonWorkflowDeps,
  id: string,
  user: RequestUser,
) {
  const existing = await prisma.lesson.findUnique({
    where: { id },
    include: { _count: { select: { blocks: true } } },
  });
  if (!existing) {
    throw new NotFoundException("Урок не найден.");
  }
  if (existing._count.blocks === 0) {
    throw new ForbiddenException("Нельзя опубликовать урок без блоков.");
  }

  const lesson = await prisma.lesson.update({
    where: { id },
    data: {
      status: ContentStatus.published,
      firstPublishedAt: existing.firstPublishedAt ?? new Date(),
    },
  });

  await auditLog.record({
    actorId: user.id,
    action: "learning.lesson.publish",
    entityType: "Lesson",
    entityId: id,
  });

  return lesson;
}
