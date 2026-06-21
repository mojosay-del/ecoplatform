import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ContentStatus, Prisma } from "@prisma/client";
import { lessonBlockSchema, validateContentBlocks } from "@ecoplatform/shared";
import type { AdminActionLogService } from "../../common/admin-action-log.service";
import type { RequestUser } from "../../common/request-user";
import type { PrismaService } from "../../prisma/prisma.service";
import type { z } from "zod";
import type { learningModuleInputSchema, learningModuleUpdateInputSchema } from "../content.schemas";
import type { ContentCommonService } from "./content-common.service";
import { assertLearningModulePublishable } from "./learning-access.helpers";
import { refreshLearningModuleFileReferences } from "./learning-file-references.helpers";
import { repositionLearningModule } from "./learning-position.helpers";
import { publishedLifecycleData } from "./publish-lifecycle.helpers";

type LearningModuleInput = z.infer<typeof learningModuleInputSchema>;
type LearningModuleUpdateInput = z.infer<typeof learningModuleUpdateInputSchema>;

type LearningModuleWorkflowDeps = {
  prisma: PrismaService;
  auditLog: AdminActionLogService;
  common: ContentCommonService;
};

export async function createLearningModule(
  { prisma, auditLog, common }: LearningModuleWorkflowDeps,
  input: LearningModuleInput,
  user: RequestUser,
) {
  for (const chapter of input.chapters) {
    for (const lesson of chapter.lessons) {
      await common.assertCoverImageAllowed(lesson.coverImageId, user);
      const check = validateContentBlocks(lesson.blocks, lessonBlockSchema);

      if (!check.ok) {
        throw new ForbiddenException(check.message);
      }
    }
  }
  await common.assertCoverImageAllowed(input.coverImageId, user);

  // Позицию считаем внутри транзакции, чтобы новый модуль вставал в конец
  // по актуальному max(position). Ретрай оставлен только для редкого P2002
  // от вложенных уникальных позиций глав/уроков.
  const module = await createLearningModuleWithNextPosition({ prisma, common }, input, user.id);

  // Регистрируем все файлы модуля одной entity-row (cover + все file_id из
  // блоков уроков + все attachments). Это упрощает lookup в deleteIfUnreferenced.
  await common.recordEntityReferences("learning_module", module.id, [
    input.coverImageId,
    ...input.chapters.flatMap((chapter) =>
      chapter.lessons.flatMap((lesson) => [
        lesson.coverImageId,
        ...lesson.blocks.flatMap((block) => Array.from(common.collectFileIdsFromPayload(block.payload))),
        ...lesson.attachments.map((attachment) => attachment.fileId),
      ]),
    ),
  ]);

  await auditLog.record({
    actorId: user.id,
    action: "learning.module.create",
    entityType: "LearningModule",
    entityId: module.id,
  });

  return module;
}

export async function publishLearningModule(
  { prisma, auditLog }: LearningModuleWorkflowDeps,
  id: string,
  user: RequestUser,
) {
  const existing = await prisma.learningModule.findUnique({
    where: { id },
    include: { chapters: { include: { lessons: { include: { _count: { select: { blocks: true } } } } } } },
  });
  if (!existing) {
    throw new NotFoundException("Модуль не найден.");
  }
  if (!existing.isInDevelopment) {
    assertLearningModulePublishable(existing);
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const module = await tx.learningModule.update({
      where: { id },
      data: publishedLifecycleData(existing, now),
      include: { chapters: { include: { lessons: true } } },
    });

    const lessonIds = module.isInDevelopment
      ? []
      : module.chapters.flatMap((chapter) =>
          chapter.lessons.filter((lesson) => lesson.status === ContentStatus.draft).map((lesson) => lesson.id),
        );

    if (lessonIds.length > 0) {
      await tx.lesson.updateMany({
        where: { id: { in: lessonIds } },
        data: { status: ContentStatus.published, firstPublishedAt: now },
      });
    }

    return module;
  });

  await auditLog.record({
    actorId: user.id,
    action: "learning.module.publish",
    entityType: "LearningModule",
    entityId: id,
  });

  return result;
}

export async function unpublishLearningModule(
  { prisma, auditLog }: LearningModuleWorkflowDeps,
  id: string,
  user: RequestUser,
  reason?: string,
) {
  const existing = await prisma.learningModule.findUnique({ where: { id } });
  if (!existing) {
    throw new NotFoundException("Модуль не найден.");
  }

  const module = await prisma.learningModule.update({
    where: { id },
    data: { status: ContentStatus.draft },
  });

  await auditLog.record({
    actorId: user.id,
    action: "learning.module.unpublish",
    entityType: "LearningModule",
    entityId: id,
    comment: reason,
  });

  return module;
}

export async function updateLearningModule(
  { prisma, auditLog, common }: LearningModuleWorkflowDeps,
  id: string,
  input: LearningModuleUpdateInput,
  user: RequestUser,
) {
  const existing = await prisma.learningModule.findUnique({
    where: { id },
    include: { preview: true },
  });
  if (!existing) {
    throw new NotFoundException("Модуль не найден.");
  }
  if (input.coverImageId !== undefined) {
    await common.assertCoverImageAllowed(input.coverImageId, user);
  }

  const data: Prisma.LearningModuleUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.summary !== undefined) data.summary = input.summary;
  if (input.description !== undefined) data.description = input.description;
  if (input.coverImageId !== undefined) data.coverImageId = input.coverImageId;
  if (input.accessLevel !== undefined) data.accessLevel = input.accessLevel;
  if (input.oneTimePrice !== undefined) data.oneTimePrice = input.oneTimePrice;
  if (input.isInDevelopment !== undefined) data.isInDevelopment = input.isInDevelopment;
  const positionChanged = input.position !== undefined && input.position !== existing.position;

  let draftLessonIdsToPublish: string[] = [];
  if (existing.status === ContentStatus.published && input.isInDevelopment === false) {
    const publishable = await prisma.learningModule.findUnique({
      where: { id },
      include: { chapters: { include: { lessons: { include: { _count: { select: { blocks: true } } } } } } },
    });
    if (!publishable) {
      throw new NotFoundException("Модуль не найден.");
    }
    assertLearningModulePublishable(publishable);
    draftLessonIdsToPublish = publishable.chapters.flatMap((chapter) =>
      chapter.lessons.filter((lesson) => lesson.status === ContentStatus.draft).map((lesson) => lesson.id),
    );
  }

  if (input.preview) {
    data.preview = {
      upsert: {
        create: {
          promotionalDescription: input.preview.promotionalDescription,
          whatYouWillLearn: input.preview.whatYouWillLearn,
        },
        update: {
          promotionalDescription: input.preview.promotionalDescription,
          whatYouWillLearn: input.preview.whatYouWillLearn,
        },
      },
    };
  }

  const module = await prisma.$transaction(async (tx) => {
    if (positionChanged) {
      await repositionLearningModule(tx, id, input.position!);
    }
    if (Object.keys(data).length === 0 && !input.preview) {
      return tx.learningModule.findUniqueOrThrow({ where: { id }, include: { preview: true } });
    }
    const updated = await tx.learningModule.update({
      where: { id },
      data,
      include: { preview: true },
    });

    if (draftLessonIdsToPublish.length > 0) {
      await tx.lesson.updateMany({
        where: { id: { in: draftLessonIdsToPublish } },
        data: { status: ContentStatus.published, firstPublishedAt: new Date() },
      });
    }

    return updated;
  });

  if (input.coverImageId !== undefined && input.coverImageId !== existing.coverImageId) {
    // Перезапишем references для модуля под текущий cover (lessons/блоки
    // отдельно меняются — там свои хуки на createChapter/updateLesson/etc).
    await refreshLearningModuleFileReferences(prisma, common, id);
    await common.cleanupDetachedFiles([existing.coverImageId]);
  }

  await auditLog.record({
    actorId: user.id,
    action: "learning.module.update",
    entityType: "LearningModule",
    entityId: id,
    payload: input,
  });

  return module;
}

export async function deleteLearningModule(
  { prisma, auditLog, common }: LearningModuleWorkflowDeps,
  id: string,
  user: RequestUser,
  reason?: string,
) {
  const existing = await prisma.learningModule.findUnique({
    where: { id },
    include: {
      chapters: {
        include: {
          lessons: {
            include: {
              blocks: true,
              attachments: true,
            },
          },
        },
      },
    },
  });
  if (!existing) {
    throw new NotFoundException("Модуль не найден.");
  }

  const deletedFileIds = common.compactFileIds([
    existing.coverImageId,
    ...existing.chapters.flatMap((chapter) =>
      chapter.lessons.flatMap((lesson) => [
        lesson.coverImageId,
        ...common.collectFileIdsFromBlocks(lesson.blocks),
        ...lesson.attachments.map((attachment) => attachment.fileId),
      ]),
    ),
  ]);

  await prisma.learningModule.delete({ where: { id } });
  await common.clearEntityReferences("learning_module", id);
  await common.cleanupDetachedFiles(deletedFileIds);

  await auditLog.record({
    actorId: user.id,
    action: "learning.module.delete",
    entityType: "LearningModule",
    entityId: id,
    comment: reason,
    payload: { title: existing.title },
  });

  return { ok: true };
}

// Атомарно читает max(position) и вставляет модуль последним.
// P2002 не маскируем широко: повторяем только известный конфликт уникальности.
async function createLearningModuleWithNextPosition(
  { prisma, common }: Pick<LearningModuleWorkflowDeps, "prisma" | "common">,
  input: LearningModuleInput,
  userId: string,
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const lastPosition = await tx.learningModule.aggregate({ _max: { position: true } });
        return tx.learningModule.create({
          data: {
            title: input.title,
            summary: input.summary,
            description: input.description,
            coverImageId: input.coverImageId,
            accessLevel: input.accessLevel,
            oneTimePrice: input.oneTimePrice,
            isInDevelopment: input.isInDevelopment,
            position: (lastPosition._max.position ?? -1) + 1,
            createdById: userId,
            preview: {
              create: {
                promotionalDescription: input.preview.promotionalDescription,
                whatYouWillLearn: input.preview.whatYouWillLearn,
              },
            },
            chapters: {
              create: input.chapters.map((chapter, chapterIndex) => ({
                title: chapter.title,
                position: chapterIndex,
                createdById: userId,
                lessons: {
                  create: chapter.lessons.map((lesson, lessonIndex) => ({
                    title: lesson.title,
                    coverImageId: lesson.coverImageId,
                    coverSubtitle: lesson.coverSubtitle,
                    position: lessonIndex,
                    createdById: userId,
                    blocks: {
                      create: lesson.blocks.map((block, blockIndex) => ({
                        position: blockIndex,
                        type: block.type,
                        payload: common.payload(block),
                      })),
                    },
                    attachments: {
                      create: lesson.attachments.map((attachment, position) => ({
                        fileId: attachment.fileId,
                        displayName: attachment.displayName,
                        position,
                      })),
                    },
                  })),
                },
              })),
            },
          },
        });
      });
    } catch (err) {
      // P2002 — unique constraint violation. Только в этом случае ретраим:
      // означает, что параллельная транзакция заняла наш position, нужен новый max.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error("Не удалось создать модуль обучения после серии конфликтов позиции.");
}
