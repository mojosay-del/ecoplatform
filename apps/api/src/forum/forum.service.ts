import { Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus, ForumQuestionStatus, Prisma } from "@prisma/client";
import type { ForumSummary } from "@ecoplatform/shared";
import type { z } from "zod";
import { assertFunctionalAccess, hasAnyRole, isPlatformStaff } from "../common/access-policy";
import { paginatedResponse, resolvePagination } from "../common/pagination";
import type { RequestUser } from "../common/request-user";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import {
  acceptForumAnswer,
  createForumAnswer,
  deleteForumAnswer,
  toggleForumVote,
  updateForumAnswer,
} from "./forum-answer-workflow.helpers";
import {
  createForumQuestion,
  deleteForumQuestion,
  setForumSubscription,
  updateForumQuestion,
} from "./forum-question-workflow.helpers";
import { buildForumReputationMap, fallbackReputation } from "./forum-reputation.helpers";
import {
  mapForumQuestionDetail,
  mapForumQuestionListItem,
  toTaxonomyValue,
  type ForumQuestionRow,
} from "./forum-response.helpers";
import type {
  forumAcceptInputSchema,
  forumAnswerInputSchema,
  forumListQuerySchema,
  forumQuestionInputSchema,
  forumQuestionUpdateSchema,
} from "./forum.schemas";

type ForumListQuery = z.infer<typeof forumListQuerySchema>;
type ForumQuestionInput = z.infer<typeof forumQuestionInputSchema>;
type ForumQuestionUpdate = z.infer<typeof forumQuestionUpdateSchema>;
type ForumAnswerInput = z.infer<typeof forumAnswerInputSchema>;
type ForumAcceptInput = z.infer<typeof forumAcceptInputSchema>;

const PINNED_NEWS_LIMIT = 10;
const WEEKLY_EXPERTS_LIMIT = 3;

// Раздел «Форум» — Q&A сообщества. Чтение/запись для авторизованных с активным
// доступом (staff проходит всегда). Админ-эндпоинты — в ForumAdminService.
@Injectable()
export class ForumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: RequestUser, query: ForumListQuery) {
    assertFunctionalAccess(user);
    const pagination = resolvePagination(query, { defaultLimit: 20, maxLimit: 50 });
    const where = this.buildListWhere(query);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.forumQuestion.count({ where }),
      this.prisma.forumQuestion.findMany({
        where,
        orderBy: this.buildOrderBy(query.sort),
        take: pagination.limit,
        skip: pagination.offset,
        include: {
          rawMaterial: true,
          questionType: true,
          // Для превью принятого ответа в ленте.
          answers: { where: { isAccepted: true, hidden: false }, take: 1 },
        },
      }),
    ]);

    const reputation = await buildForumReputationMap(
      this.prisma,
      (rows as ForumQuestionRow[]).map((row) => row.authorId),
    );
    const items = (rows as ForumQuestionRow[]).map((row) => mapForumQuestionListItem(row, reputation));
    return paginatedResponse(items, total, pagination);
  }

  async getQuestion(id: string, user: RequestUser) {
    assertFunctionalAccess(user);
    const row = (await this.prisma.forumQuestion.findUnique({
      where: { id },
      include: {
        rawMaterial: true,
        questionType: true,
        answers: {
          where: { hidden: false },
          orderBy: [{ isAccepted: "desc" }, { votesCount: "desc" }, { createdAt: "asc" }],
        },
      },
    })) as (ForumQuestionRow & { answers: NonNullable<ForumQuestionRow["answers"]> }) | null;

    const staff = isPlatformStaff(user);
    if (!row || (row.status === ForumQuestionStatus.hidden && !staff)) {
      throw new NotFoundException("Вопрос не найден.");
    }

    const authorIds = [row.authorId, ...row.answers.map((answer) => answer.authorId)];
    const [reputation, votes, subscription] = await Promise.all([
      buildForumReputationMap(this.prisma, authorIds),
      this.prisma.forumAnswerVote.findMany({
        where: { userId: user.id, answerId: { in: row.answers.map((answer) => answer.id) } },
        select: { answerId: true },
      }),
      this.prisma.forumSubscription.findUnique({
        where: { questionId_userId: { questionId: id, userId: user.id } },
        select: { id: true },
      }),
    ]);

    const votedAnswerIds = new Set(votes.map((vote) => vote.answerId));
    const isAuthor = row.authorId === user.id;
    const canManageAnswer = (authorId: string) => authorId === user.id || hasAnyRole(user, ["moderator", "admin"]);

    return mapForumQuestionDetail(row, reputation, {
      isAuthor,
      canManageQuestion: isAuthor || hasAnyRole(user, ["moderator", "admin"]),
      subscribed: Boolean(subscription),
      votedAnswerIds,
      canManageAnswer,
    });
  }

  async recordQuestionView(id: string, user: RequestUser) {
    assertFunctionalAccess(user);
    const row = await this.prisma.forumQuestion.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    const staff = isPlatformStaff(user);
    if (!row || (row.status === ForumQuestionStatus.hidden && !staff)) {
      throw new NotFoundException("Вопрос не найден.");
    }

    const updated = await this.prisma.forumQuestion.update({
      where: { id },
      data: { views: { increment: 1 } },
      select: { views: true },
    });
    return { views: updated.views };
  }

  async taxonomy(user: RequestUser) {
    assertFunctionalAccess(user);
    const [rawMaterials, questionTypes] = await Promise.all([
      this.prisma.forumRawMaterial.findMany({ orderBy: { position: "asc" } }),
      this.prisma.forumQuestionType.findMany({ orderBy: { position: "asc" } }),
    ]);
    return {
      rawMaterials: rawMaterials.map(toTaxonomyValue),
      questionTypes: questionTypes.map(toTaxonomyValue),
    };
  }

  async summary(user: RequestUser): Promise<ForumSummary> {
    assertFunctionalAccess(user);
    const weekStart = startOfCurrentWeekUtc();

    const [solvedQuestionsCount, answersCount, solvedAnswersCount, weeklyGroups] = await Promise.all([
      this.prisma.forumQuestion.count({ where: { status: ForumQuestionStatus.solved } }),
      this.prisma.forumAnswer.count({ where: { authorId: user.id, hidden: false } }),
      this.prisma.forumAnswer.count({ where: { authorId: user.id, hidden: false, isAccepted: true } }),
      this.prisma.forumAnswer.groupBy({
        by: ["authorId"],
        where: {
          hidden: false,
          isAccepted: true,
          question: {
            status: ForumQuestionStatus.solved,
            solvedAt: { gte: weekStart },
          },
        },
        _count: { _all: true },
      }),
    ]);

    const sortedGroups = weeklyGroups
      .sort((left, right) => right._count._all - left._count._all || left.authorId.localeCompare(right.authorId))
      .slice(0, WEEKLY_EXPERTS_LIMIT);
    const reputation = await buildForumReputationMap(
      this.prisma,
      sortedGroups.map((row) => row.authorId),
    );

    return {
      solvedQuestionsCount,
      currentUser: {
        answersCount,
        solvedAnswersCount,
      },
      weeklyExperts: sortedGroups.map((row) => ({
        author: reputation.get(row.authorId) ?? fallbackReputation(row.authorId),
        solvedAnswersCount: row._count._all,
      })),
    };
  }

  // Закреплённые в форуме новости («якоря») — сверху ленты.
  async pinnedNews(user: RequestUser) {
    assertFunctionalAccess(user);
    const rows = await this.prisma.newsPost.findMany({
      where: { status: ContentStatus.published, pinnedInForum: true },
      orderBy: { firstPublishedAt: "desc" },
      take: PINNED_NEWS_LIMIT,
      select: {
        id: true,
        slug: true,
        title: true,
        lead: true,
        firstPublishedAt: true,
        blocks: { where: { type: "audio" }, select: { id: true }, take: 1 },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      lead: row.lead,
      hasPodcast: row.blocks.length > 0,
      firstPublishedAt: row.firstPublishedAt ? row.firstPublishedAt.toISOString() : null,
    }));
  }

  // ── Запись ────────────────────────────────────────────────────────────────
  async ask(input: ForumQuestionInput, user: RequestUser) {
    assertFunctionalAccess(user);
    return createForumQuestion({ prisma: this.prisma }, input, { id: user.id, companyId: user.companyId });
  }

  async updateQuestion(id: string, input: ForumQuestionUpdate, user: RequestUser) {
    assertFunctionalAccess(user);
    return updateForumQuestion({ prisma: this.prisma }, id, input, user);
  }

  async deleteQuestion(id: string, user: RequestUser) {
    assertFunctionalAccess(user);
    return deleteForumQuestion({ prisma: this.prisma }, id, user);
  }

  async answer(questionId: string, input: ForumAnswerInput, user: RequestUser) {
    assertFunctionalAccess(user);
    return createForumAnswer(this.workflowDeps(), questionId, input.body, {
      id: user.id,
      companyId: user.companyId,
    });
  }

  async updateAnswer(answerId: string, input: ForumAnswerInput, user: RequestUser) {
    assertFunctionalAccess(user);
    return updateForumAnswer(this.workflowDeps(), answerId, input.body, user);
  }

  async deleteAnswer(answerId: string, user: RequestUser) {
    assertFunctionalAccess(user);
    return deleteForumAnswer(this.workflowDeps(), answerId, user);
  }

  async vote(answerId: string, user: RequestUser) {
    assertFunctionalAccess(user);
    return toggleForumVote(this.workflowDeps(), answerId, user);
  }

  async accept(questionId: string, input: ForumAcceptInput, user: RequestUser) {
    assertFunctionalAccess(user);
    return acceptForumAnswer(this.workflowDeps(), questionId, input.answerId, user);
  }

  async subscribe(questionId: string, user: RequestUser) {
    assertFunctionalAccess(user);
    return setForumSubscription({ prisma: this.prisma }, questionId, user, true);
  }

  async unsubscribe(questionId: string, user: RequestUser) {
    assertFunctionalAccess(user);
    return setForumSubscription({ prisma: this.prisma }, questionId, user, false);
  }

  private workflowDeps() {
    return { prisma: this.prisma, notifications: this.notifications };
  }

  private buildListWhere(query: ForumListQuery): Prisma.ForumQuestionWhereInput {
    const where: Prisma.ForumQuestionWhereInput = { status: { not: ForumQuestionStatus.hidden } };
    if (query.rawMaterialId) {
      where.rawMaterialId = query.rawMaterialId;
    }
    if (query.questionTypeId) {
      where.questionTypeId = query.questionTypeId;
    }
    if (query.sort === "unanswered") {
      where.answersCount = 0;
    }
    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { body: { contains: q, mode: "insensitive" } },
        { answers: { some: { hidden: false, body: { contains: q, mode: "insensitive" } } } },
      ];
    }
    return where;
  }

  private buildOrderBy(sort: ForumListQuery["sort"]): Prisma.ForumQuestionOrderByWithRelationInput[] {
    if (sort === "popular") {
      return [{ views: "desc" }, { answersCount: "desc" }, { createdAt: "desc" }];
    }
    // newest и unanswered — по свежести.
    return [{ createdAt: "desc" }];
  }
}

function startOfCurrentWeekUtc(now = new Date()): Date {
  const day = now.getUTCDay() || 7;
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - day + 1);
  return start;
}
