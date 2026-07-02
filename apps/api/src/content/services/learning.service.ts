import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus } from "@prisma/client";
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
  assertEducationSectionAccess,
  canAccessPublishedLearningModule,
  canPreviewAuthoredContent,
  type LearningReadOptions,
} from "./learning-access.helpers";
import { mapLessonAttachment, resolveLearningAttachmentMeta } from "./learning-file-references.helpers";
import {
  createChapter as createChapterWorkflow,
  createLesson as createLessonWorkflow,
  deleteChapter as deleteChapterWorkflow,
  deleteLesson as deleteLessonWorkflow,
  publishLesson as publishLessonWorkflow,
  unpublishLesson as unpublishLessonWorkflow,
  updateChapter as updateChapterWorkflow,
  updateLesson as updateLessonWorkflow,
} from "./learning-chapter-lesson-workflow.helpers";
import {
  createLearningModule as createLearningModuleWorkflow,
  deleteLearningModule as deleteLearningModuleWorkflow,
  publishLearningModule as publishLearningModuleWorkflow,
  unpublishLearningModule as unpublishLearningModuleWorkflow,
  updateLearningModule as updateLearningModuleWorkflow,
} from "./learning-module-workflow.helpers";
import { sanitizeContentBlocksForResponse } from "./content-block-response.helpers";
import { estimateLessonMinutes } from "./learning-duration.helpers";
import { buildModuleProgressIndex } from "./learning-progress.helpers";

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

  private learningWriteWorkflowDeps() {
    return { prisma: this.prisma, auditLog: this.auditLog, common: this.common };
  }

  async listLearningModules(user: RequestUser, paginationInput: PaginationInput = {}) {
    this.common.assertFunctionalAccess(user);
    assertEducationSectionAccess(user);
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

    // Длительности и прогресс для витрины: два grouped-запроса по всем
    // модулям страницы (без N+1). Запрос блоков тянет payload'ы уроков —
    // приемлемо при курируемом объёме контента; если каталог сильно вырастет,
    // перейти на подсчёт только в detail или SQL-агрегацию.
    const moduleIds = modules.map((module) => module.id);
    const publishedLessonScope = {
      status: ContentStatus.published,
      chapter: { moduleId: { in: moduleIds } },
    };
    const [blockRows, progressRows] = await Promise.all([
      this.prisma.lessonContentBlock.findMany({
        where: { lesson: publishedLessonScope },
        select: { lessonId: true, type: true, payload: true },
      }),
      this.prisma.lessonProgress.findMany({
        where: { userId: user.id, lesson: publishedLessonScope },
        select: { lessonId: true, completedAt: true },
      }),
    ]);
    const blocksByLessonId = new Map<string, Array<{ type: string; payload: unknown }>>();
    for (const row of blockRows) {
      const list = blocksByLessonId.get(row.lessonId);
      if (list) {
        list.push(row);
      } else {
        blocksByLessonId.set(row.lessonId, [row]);
      }
    }
    const progressIndex = buildModuleProgressIndex(modules, progressRows);

    const items = modules.map((module) => {
      const hasAccess = canAccessPublishedLearningModule(user, module);
      const moduleProgress = progressIndex.get(module.id);
      const totalEstimatedMinutes = module.chapters.reduce(
        (moduleSum, chapter) =>
          moduleSum +
          chapter.lessons.reduce(
            (chapterSum, lesson) => chapterSum + estimateLessonMinutes(blocksByLessonId.get(lesson.id) ?? []),
            0,
          ),
        0,
      );

      return {
        ...module,
        hasAccess,
        totalLessons: moduleProgress?.progress.totalLessons ?? 0,
        totalEstimatedMinutes,
        // Прогресс отдаём только при доступе — зеркалит detail-эндпоинт.
        progress: hasAccess ? (moduleProgress?.progress ?? null) : null,
        nextLessonId: hasAccess ? (moduleProgress?.nextLessonId ?? null) : null,
        lastActivityAt: hasAccess ? (moduleProgress?.lastActivityAt ?? null) : null,
      };
    });

    return paginatedResponse(items, total, pagination);
  }

  async getLearningModule(id: string, user: RequestUser, options: LearningReadOptions = {}) {
    this.common.assertFunctionalAccess(user);
    assertEducationSectionAccess(user);
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
    let totalEstimatedMinutes = 0;
    let nextLessonId: string | null = null;
    const totalLessons = visibleChapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);
    const chapters = visibleChapters.map((chapter) => ({
      ...chapter,
      lessons: chapter.lessons.map((lesson) => {
        const { progress, ...lessonWithoutProgress } = lesson;
        const completedAt = progress[0]?.completedAt ?? null;
        // Оценка длительности считается по блокам до их отрезания в публичной
        // ветке — «≈ N мин» видно и без доступа (как и названия уроков).
        const estimatedMinutes = estimateLessonMinutes(lessonWithoutProgress.blocks);
        totalEstimatedMinutes += estimatedMinutes;

        if (hasAccess) {
          if (completedAt) {
            completedLessons += 1;
          } else if (!nextLessonId) {
            nextLessonId = lesson.id;
          }
          return {
            ...lessonWithoutProgress,
            blocks: sanitizeContentBlocksForResponse(lessonWithoutProgress.blocks),
            attachments: lessonWithoutProgress.attachments.map((attachment) =>
              mapLessonAttachment(attachment, attachmentMeta.get(attachment.fileId)),
            ),
            completedAt,
            estimatedMinutes,
          };
        }

        const { blocks: _blocks, attachments: _attachments, ...publicLesson } = lessonWithoutProgress;
        return { ...publicLesson, estimatedMinutes };
      }),
    }));
    const progressPercent = totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100);

    return {
      ...module,
      chapters,
      hasAccess,
      totalLessons,
      totalEstimatedMinutes,
      progress: hasAccess ? { completedLessons, totalLessons, percent: progressPercent } : null,
      nextLessonId: hasAccess ? nextLessonId : null,
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

    return paginatedResponse(
      items.map((module) => ({
        ...module,
        chapters: module.chapters.map((chapter) => ({
          ...chapter,
          lessons: chapter.lessons.map((lesson) => ({
            ...lesson,
            blocks: sanitizeContentBlocksForResponse(lesson.blocks),
          })),
        })),
      })),
      total,
      pagination,
    );
  }

  createLearningModule(input: LearningModuleInput, user: RequestUser) {
    return createLearningModuleWorkflow(this.learningWriteWorkflowDeps(), input, user);
  }

  publishLearningModule(id: string, user: RequestUser) {
    return publishLearningModuleWorkflow(this.learningWriteWorkflowDeps(), id, user);
  }

  unpublishLearningModule(id: string, user: RequestUser, reason?: string) {
    return unpublishLearningModuleWorkflow(this.learningWriteWorkflowDeps(), id, user, reason);
  }

  updateLearningModule(id: string, input: LearningModuleUpdateInput, user: RequestUser) {
    return updateLearningModuleWorkflow(this.learningWriteWorkflowDeps(), id, input, user);
  }

  deleteLearningModule(id: string, user: RequestUser, reason?: string) {
    return deleteLearningModuleWorkflow(this.learningWriteWorkflowDeps(), id, user, reason);
  }

  createChapter(moduleId: string, input: ChapterInput, user: RequestUser) {
    return createChapterWorkflow(this.learningWriteWorkflowDeps(), moduleId, input, user);
  }

  updateChapter(id: string, input: ChapterUpdateInput, user: RequestUser) {
    return updateChapterWorkflow(this.learningWriteWorkflowDeps(), id, input, user);
  }

  deleteChapter(id: string, user: RequestUser, reason?: string) {
    return deleteChapterWorkflow(this.learningWriteWorkflowDeps(), id, user, reason);
  }

  createLesson(chapterId: string, input: LessonInput, user: RequestUser) {
    return createLessonWorkflow(this.learningWriteWorkflowDeps(), chapterId, input, user);
  }

  updateLesson(id: string, input: LessonUpdateInput, user: RequestUser) {
    return updateLessonWorkflow(this.learningWriteWorkflowDeps(), id, input, user);
  }

  deleteLesson(id: string, user: RequestUser, reason?: string) {
    return deleteLessonWorkflow(this.learningWriteWorkflowDeps(), id, user, reason);
  }

  unpublishLesson(id: string, user: RequestUser, reason?: string) {
    return unpublishLessonWorkflow(this.learningWriteWorkflowDeps(), id, user, reason);
  }

  publishLesson(id: string, user: RequestUser) {
    return publishLessonWorkflow(this.learningWriteWorkflowDeps(), id, user);
  }

  async completeLesson(lessonId: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    assertEducationSectionAccess(user);
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
