import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus, Prisma } from "@prisma/client";
import { lessonBlockSchema, validateContentBlocks } from "@ecoplatform/shared";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { ModuleAccessService } from "../../common/module-access.service";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import { FilesService } from "../../files/files.service";
import type { z } from "zod";
import type {
  chapterInputSchema,
  chapterUpdateInputSchema,
  learningModuleInputSchema,
  learningModuleUpdateInputSchema,
  lessonInputSchema,
  lessonUpdateInputSchema,
} from "../content.schemas";
import { ContentCommonService } from "./content-common.service";
import {
  canAccessPublishedLearningModule,
  canPreviewAuthoredContent,
  type LearningReadOptions,
} from "./learning-access.helpers";
import {
  mapLessonAttachment,
  refreshLearningModuleFileReferences,
  resolveLearningAttachmentMeta,
} from "./learning-file-references.helpers";
import {
  createLearningModule as createLearningModuleWorkflow,
  deleteLearningModule as deleteLearningModuleWorkflow,
  publishLearningModule as publishLearningModuleWorkflow,
  unpublishLearningModule as unpublishLearningModuleWorkflow,
  updateLearningModule as updateLearningModuleWorkflow,
} from "./learning-module-workflow.helpers";
import { repositionChapter, repositionLesson } from "./learning-position.helpers";

type LearningModuleInput = z.infer<typeof learningModuleInputSchema>;
type LearningModuleUpdateInput = z.infer<typeof learningModuleUpdateInputSchema>;
type ChapterInput = z.infer<typeof chapterInputSchema>;
type ChapterUpdateInput = z.infer<typeof chapterUpdateInputSchema>;
type LessonInput = z.infer<typeof lessonInputSchema>;
type LessonUpdateInput = z.infer<typeof lessonUpdateInputSchema>;

// Раздел «Обучение»: модули, главы, уроки, контент-блоки, доступ по подписке.
// Вынесен из ContentService — содержит публичный контракт учебного домена,
// а узкие helper-группы лежат рядом в learning-*.helpers.ts.
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly moduleAccess: ModuleAccessService,
    private readonly common: ContentCommonService,
    private readonly files: FilesService,
  ) {}

  private learningModuleWorkflowDeps() {
    return { prisma: this.prisma, auditLog: this.auditLog, common: this.common };
  }

  async listLearningModules(user: RequestUser, paginationInput: PaginationInput = {}) {
    this.common.assertFunctionalAccess(user);
    const pagination = resolvePagination(paginationInput, { defaultLimit: 20, maxLimit: 100 });
    const where = { status: ContentStatus.published };
    const [total, modules] = await this.prisma.$transaction([
      this.prisma.learningModule.count({ where }),
      this.prisma.learningModule.findMany({
        where,
        orderBy: [{ position: "asc" }, { createdAt: "desc" }],
        take: pagination.limit,
        skip: pagination.offset,
        include: {
          chapters: {
            include: {
              lessons: { where: { status: ContentStatus.published }, orderBy: { position: "asc" } },
            },
            orderBy: { position: "asc" },
          },
        },
      }),
    ]);

    const items = modules.map((module) => ({
      ...module,
      hasAccess: canAccessPublishedLearningModule(user, module),
    }));

    return paginatedResponse(items, total, pagination);
  }

  async getLearningModule(id: string, user: RequestUser, options: LearningReadOptions = {}) {
    this.common.assertFunctionalAccess(user);
    const module = await this.prisma.learningModule.findUnique({
      where: { id },
      include: {
        preview: true,
        chapters: {
          orderBy: { position: "asc" },
          include: {
            lessons: {
              orderBy: { position: "asc" },
              include: {
                blocks: { orderBy: { position: "asc" } },
                attachments: true,
                progress: { where: { userId: user.id }, select: { completedAt: true } },
              },
            },
          },
        },
      },
    });

    if (!module) {
      throw new NotFoundException("Модуль не найден.");
    }
    const canPreview = options.preview && canPreviewAuthoredContent(user, module.createdById);
    if (module.status !== ContentStatus.published && !canPreview) {
      throw new NotFoundException("Модуль не найден.");
    }

    const visibleChapters = module.chapters.map((chapter) => ({
      ...chapter,
      lessons: canPreview
        ? chapter.lessons
        : chapter.lessons.filter((lesson) => lesson.status === ContentStatus.published),
    }));
    const hasAccess = canPreview || canAccessPublishedLearningModule(user, module);
    // Presigned-ссылки на вложения считаем только при наличии доступа — за гейтом.
    const attachmentMeta = hasAccess
      ? await resolveLearningAttachmentMeta(this.prisma, this.files, visibleChapters)
      : new Map();
    let completedLessons = 0;
    const totalLessons = visibleChapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);
    const chapters = visibleChapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((lesson) => {
        const { progress, ...lessonWithoutProgress } = lesson;
        const completedAt = progress[0]?.completedAt ?? null;

        if (hasAccess) {
          if (completedAt) {
            completedLessons += 1;
          }
          return {
            ...lessonWithoutProgress,
            attachments: lessonWithoutProgress.attachments.map((attachment) =>
              mapLessonAttachment(attachment, attachmentMeta.get(attachment.fileId)),
            ),
            completedAt,
          };
        }

        const { blocks: _blocks, attachments: _attachments, ...publicLesson } = lessonWithoutProgress;
        return publicLesson;
      }),
    }));
    const progressPercent = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);

    return {
      ...module,
      chapters,
      hasAccess,
      progress: hasAccess ? { completedLessons, totalLessons, percent: progressPercent } : null,
    };
  }

  async adminListLearningModules(paginationInput: PaginationInput = {}) {
    const pagination = resolvePagination(paginationInput, { defaultLimit: 50, maxLimit: 200 });
    const [total, items] = await this.prisma.$transaction([
      this.prisma.learningModule.count(),
      this.prisma.learningModule.findMany({
        orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
        take: pagination.limit,
        skip: pagination.offset,
        include: {
          preview: true,
          chapters: {
            orderBy: { position: "asc" },
            include: {
              lessons: {
                orderBy: { position: "asc" },
                include: {
                  blocks: { orderBy: { position: "asc" } },
                  attachments: { orderBy: { position: "asc" } },
                },
              },
            },
          },
        },
      }),
    ]);

    return paginatedResponse(items, total, pagination);
  }

  createLearningModule(input: LearningModuleInput, user: RequestUser) {
    return createLearningModuleWorkflow(this.learningModuleWorkflowDeps(), input, user);
  }

  publishLearningModule(id: string, user: RequestUser) {
    return publishLearningModuleWorkflow(this.learningModuleWorkflowDeps(), id, user);
  }

  unpublishLearningModule(id: string, user: RequestUser, reason?: string) {
    return unpublishLearningModuleWorkflow(this.learningModuleWorkflowDeps(), id, user, reason);
  }

  updateLearningModule(id: string, input: LearningModuleUpdateInput, user: RequestUser) {
    return updateLearningModuleWorkflow(this.learningModuleWorkflowDeps(), id, input, user);
  }

  deleteLearningModule(id: string, user: RequestUser, reason?: string) {
    return deleteLearningModuleWorkflow(this.learningModuleWorkflowDeps(), id, user, reason);
  }

  async createChapter(moduleId: string, input: ChapterInput, user: RequestUser) {
    const module = await this.prisma.learningModule.findUnique({ where: { id: moduleId } });
    if (!module) {
      throw new NotFoundException("Модуль не найден.");
    }

    const chapter = await this.prisma.chapter.create({
      data: {
        moduleId,
        title: input.title,
        position: input.position,
        createdById: user.id,
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.chapter.create",
      entityType: "Chapter",
      entityId: chapter.id,
      payload: { moduleId },
    });

    return chapter;
  }

  async updateChapter(id: string, input: ChapterUpdateInput, user: RequestUser) {
    const existing = await this.prisma.chapter.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Глава не найдена.");
    }

    const positionChanged = input.position !== undefined && input.position !== existing.position;

    const chapter = await this.prisma.$transaction(async (tx) => {
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

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.chapter.update",
      entityType: "Chapter",
      entityId: id,
      payload: input,
    });

    return chapter;
  }

  async deleteChapter(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.chapter.findUnique({
      where: { id },
      include: { _count: { select: { lessons: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Глава не найдена.");
    }
    if (existing._count.lessons > 0) {
      throw new ForbiddenException("Нельзя удалить главу с уроками.");
    }

    await this.prisma.chapter.delete({ where: { id } });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.chapter.delete",
      entityType: "Chapter",
      entityId: id,
      comment: reason,
      payload: { title: existing.title, moduleId: existing.moduleId },
    });

    return { ok: true };
  }

  async createLesson(chapterId: string, input: LessonInput, user: RequestUser) {
    const chapter = await this.prisma.chapter.findUnique({ where: { id: chapterId } });
    if (!chapter) {
      throw new NotFoundException("Глава не найдена.");
    }

    if (input.blocks.length > 0) {
      const check = validateContentBlocks(input.blocks, lessonBlockSchema);
      if (!check.ok) {
        throw new ForbiddenException(check.message);
      }
    }

    const lesson = await this.prisma.lesson.create({
      data: {
        chapterId,
        title: input.title,
        position: input.position,
        createdById: user.id,
        blocks: {
          create: input.blocks.map((block, position) => ({
            position,
            type: block.type,
            payload: this.common.payload(block),
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

    await refreshLearningModuleFileReferences(this.prisma, this.common, chapter.moduleId);

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.lesson.create",
      entityType: "Lesson",
      entityId: lesson.id,
      payload: { chapterId },
    });

    return lesson;
  }

  async updateLesson(id: string, input: LessonUpdateInput, user: RequestUser) {
    const existing = await this.prisma.lesson.findUnique({
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

    const positionChanged = input.position !== undefined && input.position !== existing.position;
    const previousFileIds = this.common.compactFileIds([
      ...(input.blocks ? this.common.collectFileIdsFromBlocks(existing.blocks) : []),
      ...(input.attachments ? existing.attachments.map((attachment) => attachment.fileId) : []),
    ]);

    const lesson = await this.prisma.$transaction(async (tx) => {
      if (positionChanged) {
        await repositionLesson(tx, existing.chapterId, id, input.position!);
      }

      const data: Prisma.LessonUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;

      if (input.blocks) {
        await tx.lessonContentBlock.deleteMany({ where: { lessonId: id } });
        data.blocks = {
          create: input.blocks.map((block, position) => ({
            position,
            type: block.type,
            payload: this.common.payload(block),
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
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: existing.chapterId },
      select: { moduleId: true },
    });
    if (chapter) {
      await refreshLearningModuleFileReferences(this.prisma, this.common, chapter.moduleId);
    }

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.lesson.update",
      entityType: "Lesson",
      entityId: id,
    });

    await this.common.cleanupDetachedFiles(previousFileIds);

    return lesson;
  }

  async deleteLesson(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.lesson.findUnique({
      where: { id },
      include: { blocks: true, attachments: true },
    });
    if (!existing) {
      throw new NotFoundException("Урок не найден.");
    }

    const deletedFileIds = this.common.compactFileIds([
      ...this.common.collectFileIdsFromBlocks(existing.blocks),
      ...existing.attachments.map((attachment) => attachment.fileId),
    ]);

    const chapter = await this.prisma.chapter.findUnique({
      where: { id: existing.chapterId },
      select: { moduleId: true },
    });
    await this.prisma.lesson.delete({ where: { id } });
    if (chapter) {
      await refreshLearningModuleFileReferences(this.prisma, this.common, chapter.moduleId);
    }
    await this.common.cleanupDetachedFiles(deletedFileIds);

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.lesson.delete",
      entityType: "Lesson",
      entityId: id,
      comment: reason,
      payload: { title: existing.title, chapterId: existing.chapterId },
    });

    return { ok: true };
  }

  async unpublishLesson(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.lesson.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Урок не найден.");
    }

    const lesson = await this.prisma.lesson.update({
      where: { id },
      data: { status: ContentStatus.draft },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.lesson.unpublish",
      entityType: "Lesson",
      entityId: id,
      comment: reason,
    });

    return lesson;
  }

  async publishLesson(id: string, user: RequestUser) {
    const existing = await this.prisma.lesson.findUnique({
      where: { id },
      include: { _count: { select: { blocks: true } } },
    });
    if (!existing) {
      throw new NotFoundException("Урок не найден.");
    }
    if (existing._count.blocks === 0) {
      throw new ForbiddenException("Нельзя опубликовать урок без блоков.");
    }

    const lesson = await this.prisma.lesson.update({
      where: { id },
      data: {
        status: ContentStatus.published,
        firstPublishedAt: existing.firstPublishedAt ?? new Date(),
      },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.lesson.publish",
      entityType: "Lesson",
      entityId: id,
    });

    return lesson;
  }

  async completeLesson(lessonId: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { chapter: { include: { module: true } } },
    });
    if (
      !lesson ||
      lesson.status !== ContentStatus.published ||
      lesson.chapter.module.status !== ContentStatus.published
    ) {
      throw new NotFoundException("Урок не найден.");
    }
    if (!canAccessPublishedLearningModule(user, lesson.chapter.module)) {
      throw new ForbiddenException("Доступ к модулю закрыт.");
    }

    return this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      update: {},
      create: { userId: user.id, lessonId },
    });
  }
}
