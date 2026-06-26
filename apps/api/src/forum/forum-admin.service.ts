import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ForumQuestionStatus, Prisma } from "@prisma/client";
import type { z } from "zod";
import { AdminActionLogService } from "../common/admin-action-log.service";
import { paginatedResponse, resolvePagination } from "../common/pagination";
import type { RequestUser } from "../common/request-user";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { createForumAnswer } from "./forum-answer-workflow.helpers";
import { createForumQuestion } from "./forum-question-workflow.helpers";
import {
  mapForumAdminQuestionDetail,
  mapForumAdminQuestionItem,
  toTaxonomyValue,
  type ForumAnswerRow,
  type ForumQuestionRow,
} from "./forum-response.helpers";
import { recomputeForumQuestionState } from "./forum-state.helpers";
import type {
  forumAdminListQuerySchema,
  forumAnswerInputSchema,
  forumQuestionInputSchema,
  forumTaxonomyInputSchema,
  forumTaxonomyUpdateSchema,
} from "./forum.schemas";

type ForumAdminListQuery = z.infer<typeof forumAdminListQuerySchema>;
type ForumQuestionInput = z.infer<typeof forumQuestionInputSchema>;
type ForumAnswerInput = z.infer<typeof forumAnswerInputSchema>;
type ForumTaxonomyInput = z.infer<typeof forumTaxonomyInputSchema>;
type ForumTaxonomyUpdate = z.infer<typeof forumTaxonomyUpdateSchema>;

// Админ/контент-менеджер/модератор раздела «Форум»: справочники, засев, модерация.
// Права разнесены по ролям на уровне контроллера (@Roles).
@Injectable()
export class ForumAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Список вопросов (модерация/обзор) ───────────────────────────────────────
  async listQuestions(query: ForumAdminListQuery) {
    const pagination = resolvePagination(query, { defaultLimit: 50, maxLimit: 100 });
    const where: Prisma.ForumQuestionWhereInput = {};
    if (query.status) {
      where.status = query.status as ForumQuestionStatus;
    }
    if (query.rawMaterialId) {
      where.rawMaterialId = query.rawMaterialId;
    }
    if (query.questionTypeId) {
      where.questionTypeId = query.questionTypeId;
    }
    const q = query.q?.trim();
    if (q) {
      where.OR = [{ title: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.forumQuestion.count({ where }),
      this.prisma.forumQuestion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: pagination.limit,
        skip: pagination.offset,
        include: { rawMaterial: true, questionType: true },
      }),
    ]);

    const authorIds = [...new Set((rows as ForumQuestionRow[]).map((row) => row.authorId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(users.map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]));

    const items = (rows as ForumQuestionRow[]).map((row) =>
      mapForumAdminQuestionItem({ ...row, authorName: nameById.get(row.authorId) ?? "—" }),
    );
    return paginatedResponse(items, total, pagination);
  }

  // ── Детальная карточка для модерации (тело + все ответы, включая скрытые) ────
  async getQuestionForModeration(id: string) {
    const row = await this.prisma.forumQuestion.findUnique({
      where: { id },
      include: {
        rawMaterial: true,
        questionType: true,
        answers: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!row) {
      throw new NotFoundException("Вопрос не найден.");
    }

    const typedRow = row as ForumQuestionRow & { answers: ForumAnswerRow[] };
    const authorIds = [...new Set([typedRow.authorId, ...typedRow.answers.map((answer) => answer.authorId)])];
    const users = await this.prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(users.map((user) => [user.id, `${user.firstName} ${user.lastName}`.trim()]));

    return mapForumAdminQuestionDetail({ ...typedRow, authorName: nameById.get(typedRow.authorId) ?? "—" }, nameById);
  }

  // ── Справочники (две оси) ───────────────────────────────────────────────────
  async taxonomy() {
    const [rawMaterials, questionTypes] = await Promise.all([
      this.prisma.forumRawMaterial.findMany({ orderBy: { position: "asc" } }),
      this.prisma.forumQuestionType.findMany({ orderBy: { position: "asc" } }),
    ]);
    return {
      rawMaterials: rawMaterials.map(toTaxonomyValue),
      questionTypes: questionTypes.map(toTaxonomyValue),
    };
  }

  async createRawMaterial(input: ForumTaxonomyInput, user: RequestUser) {
    const position = input.position ?? (await this.nextRawMaterialPosition());
    const created = await this.guardUnique(() =>
      this.prisma.forumRawMaterial.create({ data: { label: input.label, position } }),
    );
    await this.logTaxonomy(user, "create", "ForumRawMaterial", created.id, { label: created.label });
    return toTaxonomyValue(created);
  }

  async updateRawMaterial(id: string, input: ForumTaxonomyUpdate, user: RequestUser) {
    await this.assertExists(this.prisma.forumRawMaterial.findUnique({ where: { id } }), "Вид сырья не найден.");
    const updated = await this.guardUnique(() =>
      this.prisma.forumRawMaterial.update({ where: { id }, data: { label: input.label, position: input.position } }),
    );
    await this.logTaxonomy(user, "update", "ForumRawMaterial", id, { label: updated.label });
    return toTaxonomyValue(updated);
  }

  async deleteRawMaterial(id: string, user: RequestUser) {
    await this.assertExists(this.prisma.forumRawMaterial.findUnique({ where: { id } }), "Вид сырья не найден.");
    // onDelete: SetNull — тег обнуляется у вопросов, сами вопросы остаются (ТЗ §6).
    const affected = await this.prisma.forumQuestion.count({ where: { rawMaterialId: id } });
    await this.prisma.forumRawMaterial.delete({ where: { id } });
    await this.logTaxonomy(user, "delete", "ForumRawMaterial", id, { affectedQuestions: affected });
    return { ok: true, affectedQuestions: affected };
  }

  async createQuestionType(input: ForumTaxonomyInput, user: RequestUser) {
    const position = input.position ?? (await this.nextQuestionTypePosition());
    const created = await this.guardUnique(() =>
      this.prisma.forumQuestionType.create({ data: { label: input.label, position } }),
    );
    await this.logTaxonomy(user, "create", "ForumQuestionType", created.id, { label: created.label });
    return toTaxonomyValue(created);
  }

  async updateQuestionType(id: string, input: ForumTaxonomyUpdate, user: RequestUser) {
    await this.assertExists(this.prisma.forumQuestionType.findUnique({ where: { id } }), "Тип вопроса не найден.");
    const updated = await this.guardUnique(() =>
      this.prisma.forumQuestionType.update({ where: { id }, data: { label: input.label, position: input.position } }),
    );
    await this.logTaxonomy(user, "update", "ForumQuestionType", id, { label: updated.label });
    return toTaxonomyValue(updated);
  }

  async deleteQuestionType(id: string, user: RequestUser) {
    await this.assertExists(this.prisma.forumQuestionType.findUnique({ where: { id } }), "Тип вопроса не найден.");
    const affected = await this.prisma.forumQuestion.count({ where: { questionTypeId: id } });
    await this.prisma.forumQuestionType.delete({ where: { id } });
    await this.logTaxonomy(user, "delete", "ForumQuestionType", id, { affectedQuestions: affected });
    return { ok: true, affectedQuestions: affected };
  }

  // ── Засев контента от лица команды/эксперта ─────────────────────────────────
  async seedQuestion(input: ForumQuestionInput, user: RequestUser) {
    const created = await createForumQuestion({ prisma: this.prisma }, input, {
      id: user.id,
      companyId: user.companyId,
    });
    await this.auditLog.record({
      actorId: user.id,
      action: "forum.seed.question",
      entityType: "ForumQuestion",
      entityId: created.id,
      payload: { title: input.title },
    });
    return created;
  }

  async seedAnswer(questionId: string, input: ForumAnswerInput, user: RequestUser) {
    const created = await createForumAnswer(
      { prisma: this.prisma, notifications: this.notifications },
      questionId,
      input.body,
      { id: user.id, companyId: user.companyId },
    );
    await this.auditLog.record({
      actorId: user.id,
      action: "forum.seed.answer",
      entityType: "ForumAnswer",
      entityId: created.id,
      payload: { questionId },
    });
    return created;
  }

  // ── Быстрая модерация (скрыть/восстановить/удалить) ─────────────────────────
  async hideQuestion(id: string, user: RequestUser) {
    await this.assertExists(this.prisma.forumQuestion.findUnique({ where: { id } }), "Вопрос не найден.");
    await this.prisma.forumQuestion.update({ where: { id }, data: { status: ForumQuestionStatus.hidden } });
    await this.logModeration(user, "forum.question.hide", "ForumQuestion", id);
    return { ok: true };
  }

  async restoreQuestion(id: string, user: RequestUser) {
    await this.assertExists(this.prisma.forumQuestion.findUnique({ where: { id } }), "Вопрос не найден.");
    await this.prisma.$transaction(async (tx) => {
      // Снимаем hidden, затем пересчёт выставит корректный open/answered/solved.
      await tx.forumQuestion.update({ where: { id }, data: { status: ForumQuestionStatus.open } });
      await recomputeForumQuestionState(tx, id);
    });
    await this.logModeration(user, "forum.question.restore", "ForumQuestion", id);
    return { ok: true };
  }

  async deleteQuestion(id: string, user: RequestUser) {
    await this.assertExists(this.prisma.forumQuestion.findUnique({ where: { id } }), "Вопрос не найден.");
    await this.prisma.forumQuestion.delete({ where: { id } });
    await this.logModeration(user, "forum.question.delete", "ForumQuestion", id);
    return { ok: true };
  }

  async hideAnswer(id: string, user: RequestUser) {
    const answer = await this.prisma.forumAnswer.findUnique({ where: { id }, select: { questionId: true } });
    if (!answer) {
      throw new NotFoundException("Ответ не найден.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.forumAnswer.update({ where: { id }, data: { hidden: true } });
      await recomputeForumQuestionState(tx, answer.questionId);
    });
    await this.logModeration(user, "forum.answer.hide", "ForumAnswer", id);
    return { ok: true };
  }

  async restoreAnswer(id: string, user: RequestUser) {
    const answer = await this.prisma.forumAnswer.findUnique({ where: { id }, select: { questionId: true } });
    if (!answer) {
      throw new NotFoundException("Ответ не найден.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.forumAnswer.update({ where: { id }, data: { hidden: false } });
      await recomputeForumQuestionState(tx, answer.questionId);
    });
    await this.logModeration(user, "forum.answer.restore", "ForumAnswer", id);
    return { ok: true };
  }

  async deleteAnswer(id: string, user: RequestUser) {
    const answer = await this.prisma.forumAnswer.findUnique({ where: { id }, select: { questionId: true } });
    if (!answer) {
      throw new NotFoundException("Ответ не найден.");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.forumAnswer.delete({ where: { id } });
      await recomputeForumQuestionState(tx, answer.questionId);
    });
    await this.logModeration(user, "forum.answer.delete", "ForumAnswer", id);
    return { ok: true };
  }

  // ── helpers ─────────────────────────────────────────────────────────────────
  private async nextRawMaterialPosition(): Promise<number> {
    const max = await this.prisma.forumRawMaterial.aggregate({ _max: { position: true } });
    return (max._max.position ?? -1) + 1;
  }

  private async nextQuestionTypePosition(): Promise<number> {
    const max = await this.prisma.forumQuestionType.aggregate({ _max: { position: true } });
    return (max._max.position ?? -1) + 1;
  }

  private async assertExists<T>(promise: Promise<T | null>, message: string): Promise<T> {
    const found = await promise;
    if (!found) {
      throw new NotFoundException(message);
    }
    return found;
  }

  private async guardUnique<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Значение с таким названием уже есть.");
      }
      throw error;
    }
  }

  private logTaxonomy(
    user: RequestUser,
    action: "create" | "update" | "delete",
    entityType: string,
    entityId: string,
    payload: Prisma.InputJsonValue,
  ) {
    return this.auditLog.record({
      actorId: user.id,
      action: `forum.taxonomy.${action}`,
      entityType,
      entityId,
      payload,
    });
  }

  private logModeration(user: RequestUser, action: string, entityType: string, entityId: string) {
    return this.auditLog.record({ actorId: user.id, action, entityType, entityId });
  }
}
