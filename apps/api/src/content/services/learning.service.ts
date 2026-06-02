import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus, LearningAccessLevel, Prisma } from "@prisma/client";
import { canAccessLearningLevel, lessonBlockSchema, validateContentBlocks } from "@ecoplatform/shared";
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

type LearningModuleInput = z.infer<typeof learningModuleInputSchema>;
type LearningModuleUpdateInput = z.infer<typeof learningModuleUpdateInputSchema>;
type ChapterInput = z.infer<typeof chapterInputSchema>;
type ChapterUpdateInput = z.infer<typeof chapterUpdateInputSchema>;
type LessonInput = z.infer<typeof lessonInputSchema>;
type LessonUpdateInput = z.infer<typeof lessonUpdateInputSchema>;
type LearningReadOptions = { preview?: boolean };

function canPreviewAuthoredContent(user: RequestUser, createdById: string | null | undefined) {
  return (
    user.id === createdById || user.platformRoles.includes("admin") || user.platformRoles.includes("content_manager")
  );
}

// Раздел «Обучение»: модули, главы, уроки, контент-блоки, доступ по подписке.
// Вынесен из ContentService — содержит весь учебный домен и приватные хелперы
// (hasLearningAccess, reposition*, createLearningModuleWithNextPosition).
@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly moduleAccess: ModuleAccessService,
    private readonly common: ContentCommonService,
    private readonly files: FilesService,
  ) {}

  // Готовит метаданные вложений (presigned downloadUrl + имя/тип/размер) для
  // уроков, к которым у пользователя есть доступ. Presign приватных вложений
  // делается ОДНОЙ пачкой на весь модуль и только здесь — то есть уже за гейтом
  // hasAccess. Истекла подписка → урок не отдаёт вложения, и ссылка не выдаётся.
  private async resolveAttachmentMeta(
    chapters: Array<{ lessons: Array<{ attachments: Array<{ fileId: string }> }> }>,
  ): Promise<Map<string, { downloadUrl: string | null; originalName: string; mimeType: string; sizeBytes: number }>> {
    const fileIds = Array.from(
      new Set(
        chapters
          .flatMap((chapter) => chapter.lessons.flatMap((lesson) => lesson.attachments.map((a) => a.fileId)))
          .filter(Boolean),
      ),
    );
    if (fileIds.length === 0) {
      return new Map();
    }

    const assets = await this.prisma.fileAsset.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, storageKey: true, accessLevel: true, originalName: true, mimeType: true, sizeBytes: true },
    });
    const signed = await this.files.signDownloadUrls(assets);

    return new Map(
      assets.map((asset) => [
        asset.id,
        {
          downloadUrl: signed.get(asset.id) ?? null,
          originalName: asset.originalName,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
        },
      ]),
    );
  }

  private mapLessonAttachment(
    attachment: { id: string; fileId: string; displayName: string; position: number },
    meta?: { downloadUrl: string | null; originalName: string; mimeType: string; sizeBytes: number },
  ) {
    return {
      id: attachment.id,
      fileId: attachment.fileId,
      displayName: attachment.displayName,
      position: attachment.position,
      downloadUrl: meta?.downloadUrl ?? null,
      originalName: meta?.originalName ?? null,
      mimeType: meta?.mimeType ?? null,
      sizeBytes: meta?.sizeBytes ?? null,
    };
  }

  private hasLearningAccess(user: RequestUser, accessLevel: LearningAccessLevel) {
    if (user.platformRoles.length > 0) {
      return true;
    }

    return user.company ? canAccessLearningLevel(user.company, accessLevel) : false;
  }

  private canAccessPublishedLearningModule(
    user: RequestUser,
    module: { accessLevel: LearningAccessLevel; isInDevelopment: boolean },
  ) {
    return !module.isInDevelopment && this.hasLearningAccess(user, module.accessLevel);
  }

  private assertLearningModulePublishable(module: {
    chapters: Array<{
      title: string;
      lessons: Array<{ title: string; _count: { blocks: number } }>;
    }>;
  }) {
    if (module.chapters.length === 0) {
      throw new ForbiddenException("Нельзя открыть доступ к модулю без глав.");
    }
    for (const chapter of module.chapters) {
      if (chapter.lessons.length === 0) {
        throw new ForbiddenException(`В главе «${chapter.title}» нет уроков.`);
      }
      for (const lesson of chapter.lessons) {
        if (lesson._count.blocks === 0) {
          throw new ForbiddenException(`Урок «${lesson.title}» не содержит блоков.`);
        }
      }
    }
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
      hasAccess: this.canAccessPublishedLearningModule(user, module),
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
    const hasAccess = canPreview || this.canAccessPublishedLearningModule(user, module);
    // Presigned-ссылки на вложения считаем только при наличии доступа — за гейтом.
    const attachmentMeta = hasAccess ? await this.resolveAttachmentMeta(visibleChapters) : new Map();
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
              this.mapLessonAttachment(attachment, attachmentMeta.get(attachment.fileId)),
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

  async createLearningModule(input: LearningModuleInput, user: RequestUser) {
    for (const chapter of input.chapters) {
      for (const lesson of chapter.lessons) {
        const check = validateContentBlocks(lesson.blocks, lessonBlockSchema);

        if (!check.ok) {
          throw new ForbiddenException(check.message);
        }
      }
    }
    await this.common.assertCoverImageAllowed(input.coverImageId, user);

    // LearningModule.position уникально на уровне БД, поэтому aggregate+create
    // без атомарности — это гонка: два админа жмут «создать» одновременно,
    // оба видят max=N, оба пишут N+1, второй получает P2002. Ретраим до 5 раз
    // внутри одной транзакции — за это время вторая попытка увидит уже новый max.
    const module = await this.createLearningModuleWithNextPosition(input, user.id);

    // Регистрируем все файлы модуля одной entity-row (cover + все file_id из
    // блоков уроков + все attachments). Это упрощает lookup в deleteIfUnreferenced.
    await this.common.recordEntityReferences("learning_module", module.id, [
      input.coverImageId,
      ...input.chapters.flatMap((chapter) =>
        chapter.lessons.flatMap((lesson) => [
          ...lesson.blocks.flatMap((block) => Array.from(this.common.collectFileIdsFromPayload(block.payload))),
          ...lesson.attachments.map((attachment) => attachment.fileId),
        ]),
      ),
    ]);

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.module.create",
      entityType: "LearningModule",
      entityId: module.id,
    });

    return module;
  }

  // Атомарное «прочитать max(position) и вставить max+1» с ретраем на P2002.
  // Внутри транзакции aggregate видит данные на момент start, поэтому при
  // параллельной попытке второй вызов получит unique-violation — ретрай-цикл
  // его проглотит и пересчитает позицию.
  private async createLearningModuleWithNextPosition(input: LearningModuleInput, userId: string) {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
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
                      position: lessonIndex,
                      createdById: userId,
                      blocks: {
                        create: lesson.blocks.map((block, blockIndex) => ({
                          position: blockIndex,
                          type: block.type,
                          payload: this.common.payload(block),
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

  async publishLearningModule(id: string, user: RequestUser) {
    const existing = await this.prisma.learningModule.findUnique({
      where: { id },
      include: { chapters: { include: { lessons: { include: { _count: { select: { blocks: true } } } } } } },
    });
    if (!existing) {
      throw new NotFoundException("Модуль не найден.");
    }
    if (!existing.isInDevelopment) {
      this.assertLearningModulePublishable(existing);
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const module = await tx.learningModule.update({
        where: { id },
        data: {
          status: ContentStatus.published,
          firstPublishedAt: existing.firstPublishedAt ?? now,
        },
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

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.module.publish",
      entityType: "LearningModule",
      entityId: id,
    });

    return result;
  }

  async unpublishLearningModule(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.learningModule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException("Модуль не найден.");
    }

    const module = await this.prisma.learningModule.update({
      where: { id },
      data: { status: ContentStatus.draft },
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.module.unpublish",
      entityType: "LearningModule",
      entityId: id,
      comment: reason,
    });

    return module;
  }

  async updateLearningModule(id: string, input: LearningModuleUpdateInput, user: RequestUser) {
    const existing = await this.prisma.learningModule.findUnique({
      where: { id },
      include: { preview: true },
    });
    if (!existing) {
      throw new NotFoundException("Модуль не найден.");
    }
    if (input.coverImageId !== undefined) {
      await this.common.assertCoverImageAllowed(input.coverImageId, user);
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
      const publishable = await this.prisma.learningModule.findUnique({
        where: { id },
        include: { chapters: { include: { lessons: { include: { _count: { select: { blocks: true } } } } } } },
      });
      if (!publishable) {
        throw new NotFoundException("Модуль не найден.");
      }
      this.assertLearningModulePublishable(publishable);
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

    const module = await this.prisma.$transaction(async (tx) => {
      if (positionChanged) {
        await this.repositionLearningModule(tx, id, input.position!);
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
      await this.refreshModuleFileReferences(id);
      await this.common.cleanupDetachedFiles([existing.coverImageId]);
    }

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.module.update",
      entityType: "LearningModule",
      entityId: id,
      payload: input,
    });

    return module;
  }

  async deleteLearningModule(id: string, user: RequestUser, reason?: string) {
    const existing = await this.prisma.learningModule.findUnique({
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

    const deletedFileIds = this.common.compactFileIds([
      existing.coverImageId,
      ...existing.chapters.flatMap((chapter) =>
        chapter.lessons.flatMap((lesson) => [
          ...this.common.collectFileIdsFromBlocks(lesson.blocks),
          ...lesson.attachments.map((attachment) => attachment.fileId),
        ]),
      ),
    ]);

    await this.prisma.learningModule.delete({ where: { id } });
    await this.common.clearEntityReferences("learning_module", id);
    await this.common.cleanupDetachedFiles(deletedFileIds);

    await this.auditLog.record({
      actorId: user.id,
      action: "learning.module.delete",
      entityType: "LearningModule",
      entityId: id,
      comment: reason,
      payload: { title: existing.title },
    });

    return { ok: true };
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
        await this.repositionChapter(tx, existing.moduleId, id, input.position!);
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

    await this.refreshModuleFileReferences(chapter.moduleId);

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
        await this.repositionLesson(tx, existing.chapterId, id, input.position!);
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
      await this.refreshModuleFileReferences(chapter.moduleId);
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
      await this.refreshModuleFileReferences(chapter.moduleId);
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
    if (!this.canAccessPublishedLearningModule(user, lesson.chapter.module)) {
      throw new ForbiddenException("Доступ к модулю закрыт.");
    }

    return this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: user.id, lessonId } },
      update: {},
      create: { userId: user.id, lessonId },
    });
  }
  private async repositionChapter(tx: Prisma.TransactionClient, moduleId: string, itemId: string, newPosition: number) {
    const siblings = await tx.chapter.findMany({
      where: { moduleId, id: { not: itemId } },
      orderBy: { position: "asc" },
      select: { id: true },
    });

    await tx.chapter.update({ where: { id: itemId }, data: { position: -1 } });
    for (let i = 0; i < siblings.length; i++) {
      await tx.chapter.update({ where: { id: siblings[i]!.id }, data: { position: -(i + 2) } });
    }

    const ordered = siblings.map((s) => s.id);
    const clamped = Math.max(0, Math.min(newPosition, ordered.length));
    ordered.splice(clamped, 0, itemId);

    for (let i = 0; i < ordered.length; i++) {
      await tx.chapter.update({ where: { id: ordered[i]! }, data: { position: i } });
    }
  }

  private async repositionLearningModule(tx: Prisma.TransactionClient, itemId: string, newPosition: number) {
    const siblings = await tx.learningModule.findMany({
      where: { id: { not: itemId } },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      select: { id: true },
    });

    const ordered = siblings.map((s) => s.id);
    const clamped = Math.max(0, Math.min(newPosition, ordered.length));
    ordered.splice(clamped, 0, itemId);

    for (let i = 0; i < ordered.length; i++) {
      await tx.learningModule.update({ where: { id: ordered[i]! }, data: { position: i } });
    }
  }

  private async repositionLesson(tx: Prisma.TransactionClient, chapterId: string, itemId: string, newPosition: number) {
    const siblings = await tx.lesson.findMany({
      where: { chapterId, id: { not: itemId } },
      orderBy: { position: "asc" },
      select: { id: true },
    });

    await tx.lesson.update({ where: { id: itemId }, data: { position: -1 } });
    for (let i = 0; i < siblings.length; i++) {
      await tx.lesson.update({ where: { id: siblings[i]!.id }, data: { position: -(i + 2) } });
    }

    const ordered = siblings.map((s) => s.id);
    const clamped = Math.max(0, Math.min(newPosition, ordered.length));
    ordered.splice(clamped, 0, itemId);

    for (let i = 0; i < ordered.length; i++) {
      await tx.lesson.update({ where: { id: ordered[i]! }, data: { position: i } });
    }
  }

  // Для статьи базы знаний: возможно потребовать вставку с уже «выведенным» из
  // старой группы элементом (skipItemInGroup=true) — в этом случае ищем соседей
  // без него и вставляем его как новичка. Полезно при смене родителя.

  // Пересобирает FileReference для всего модуля. Зовём после любого изменения
  // (cover, блок урока, attachment), т.к. на этом уровне хранится единая
  // entity-row "learning_module" → modulesId. Цена пересборки — один SELECT
  // с join'ами + replaceMany; держим её только в местах, где состав файлов
  // действительно поменялся.
  private async refreshModuleFileReferences(moduleId: string): Promise<void> {
    const fresh = await this.prisma.learningModule.findUnique({
      where: { id: moduleId },
      include: {
        chapters: {
          include: {
            lessons: {
              include: { blocks: true, attachments: true },
            },
          },
        },
      },
    });
    if (!fresh) return;
    await this.common.recordEntityReferences("learning_module", moduleId, [
      fresh.coverImageId,
      ...fresh.chapters.flatMap((chapter) =>
        chapter.lessons.flatMap((lesson) => [
          ...this.common.collectFileIdsFromBlocks(lesson.blocks),
          ...lesson.attachments.map((attachment) => attachment.fileId),
        ]),
      ),
    ]);
  }
}
