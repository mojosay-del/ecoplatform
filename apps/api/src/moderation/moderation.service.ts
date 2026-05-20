import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CommentStatus,
  ComplaintStatus,
  ContentStatus,
  ModerationCaseStatus,
  ModerationDecisionType,
  NotificationCategory,
  SanctionType,
  type Prisma,
} from "@prisma/client";
import { canOpenFunctionalSections } from "@ecoplatform/shared";
import { AdminActionLogService } from "../common/admin-action-log.service";
import type { RequestUser } from "../common/request-user";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { complaintInputSchema, moderationDecisionInputSchema, ModeratedEntityType } from "./moderation.schemas";
import { moderatedEntityTypes } from "./moderation.schemas";
import type { z } from "zod";

const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_MODERATOR_LOCKS = 3;
const ACTIVE_CASE_STATUSES = [ModerationCaseStatus.open, ModerationCaseStatus.in_review, ModerationCaseStatus.escalated];

function isModeratedEntityType(value: string): value is ModeratedEntityType {
  return (moderatedEntityTypes as readonly string[]).includes(value);
}

type EntityResolution = {
  type: ModeratedEntityType;
  authorUserId: string | null;
  authorCompanyId: string | null;
};

type ResolvedEntitySummary =
  | {
      type: "news_comment";
      id: string;
      text: string;
      status: CommentStatus;
      createdAt: Date;
      newsPost: { id: string; title: string; slug: string };
    }
  | { type: "news_post"; id: string; title: string; slug: string; status: ContentStatus }
  | { type: "knowledge_article"; id: string; title: string; slug: string; status: ContentStatus };

type DecisionLink = { title: string; link: string };

const moderationCaseInclude = {
  complaints: { orderBy: { createdAt: "asc" } },
  decisions: { orderBy: { createdAt: "asc" } },
  sanctions: { orderBy: { appliedAt: "asc" } },
} satisfies Prisma.ModerationCaseInclude;

type ComplaintInput = z.infer<typeof complaintInputSchema>;
type ModerationDecisionInput = z.infer<typeof moderationDecisionInputSchema>;
type ModerationCaseWithRelations = Prisma.ModerationCaseGetPayload<{ include: typeof moderationCaseInclude }>;

type UserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: { id: string; organizationName: string } | null;
};

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly notifications: NotificationsService,
  ) {}

  async createComplaint(input: ComplaintInput, user: RequestUser) {
    this.assertFunctionalAccess(user);

    const existing = await this.prisma.complaint.findUnique({
      where: {
        entityType_entityId_authorId_reasonCode: {
          entityType: input.entityType,
          entityId: input.entityId,
          authorId: user.id,
          reasonCode: input.reasonCode,
        },
      },
    });

    if (existing) {
      return { complaint: existing, duplicate: true };
    }

    const entity = await this.loadPublishedEntity(input.entityType, input.entityId);

    const complaint = await this.prisma.$transaction(async (tx) => {
      const activeCase =
        (await tx.moderationCase.findFirst({
          where: {
            entityType: input.entityType,
            entityId: input.entityId,
            status: { in: ACTIVE_CASE_STATUSES },
          },
          orderBy: { createdAt: "desc" },
        })) ??
        (await tx.moderationCase.create({
          data: {
            type: "complaint",
            entityType: input.entityType,
            entityId: input.entityId,
            entityAuthorId: entity.authorUserId,
            entityCompanyId: entity.authorCompanyId,
          },
        }));

      return tx.complaint.create({
        data: {
          caseId: activeCase.id,
          entityType: input.entityType,
          entityId: input.entityId,
          authorId: user.id,
          authorCompanyId: user.companyId,
          reasonCode: input.reasonCode,
          comment: input.comment,
        },
      });
    });

    return { complaint, duplicate: false };
  }

  async listCases() {
    const cases = await this.prisma.moderationCase.findMany({
      orderBy: { createdAt: "asc" },
      include: moderationCaseInclude,
      take: 100,
    });

    return this.enrichCases(cases);
  }

  async getCase(id: string) {
    const found = await this.prisma.moderationCase.findUnique({
      where: { id },
      include: moderationCaseInclude,
    });

    if (!found) {
      throw new NotFoundException("Кейс модерации не найден.");
    }

    return (await this.enrichCases([found]))[0];
  }

  async takeCaseLock(id: string, user: RequestUser) {
    const found = await this.prisma.moderationCase.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException("Кейс модерации не найден.");
    }
    if (found.status === ModerationCaseStatus.resolved || found.status === ModerationCaseStatus.closed_by_admin) {
      throw new BadRequestException("Закрытый кейс нельзя взять в работу.");
    }

    const now = new Date();
    if (found.lockedById && found.lockedById !== user.id && found.lockedUntil && found.lockedUntil > now) {
      throw new ConflictException("Кейс уже находится в работе у другого сотрудника.");
    }

    if (!this.isAdmin(user)) {
      const activeLocks = await this.prisma.moderationCase.count({
        where: {
          lockedById: user.id,
          lockedUntil: { gt: now },
          status: ModerationCaseStatus.in_review,
          NOT: { id },
        },
      });

      if (activeLocks >= MAX_MODERATOR_LOCKS) {
        throw new ConflictException("Модератор может держать в работе не более трёх кейсов.");
      }
    }

    const locked = await this.prisma.moderationCase.update({
      where: { id },
      data: {
        status: found.status === ModerationCaseStatus.open ? ModerationCaseStatus.in_review : found.status,
        lockedById: user.id,
        lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS),
      },
      include: moderationCaseInclude,
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "moderation.case.lock",
      entityType: "ModerationCase",
      entityId: id,
      payload: { lockedUntil: locked.lockedUntil?.toISOString() },
    });

    return (await this.enrichCases([locked]))[0];
  }

  async releaseCaseLock(id: string, user: RequestUser) {
    const found = await this.prisma.moderationCase.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException("Кейс модерации не найден.");
    }
    if (found.lockedById && found.lockedById !== user.id && !this.isAdmin(user)) {
      throw new ForbiddenException("Освободить чужой lock может только администратор.");
    }

    const updated = await this.prisma.moderationCase.update({
      where: { id },
      data: {
        lockedById: null,
        lockedUntil: null,
        status: found.status === ModerationCaseStatus.in_review ? ModerationCaseStatus.open : found.status,
      },
      include: moderationCaseInclude,
    });

    await this.auditLog.record({
      actorId: user.id,
      action: "moderation.case.release",
      entityType: "ModerationCase",
      entityId: id,
    });

    return (await this.enrichCases([updated]))[0];
  }

  async createDecision(id: string, input: ModerationDecisionInput, user: RequestUser) {
    const found = await this.prisma.moderationCase.findUnique({
      where: { id },
      include: moderationCaseInclude,
    });
    if (!found) {
      throw new NotFoundException("Кейс модерации не найден.");
    }
    if (found.status === ModerationCaseStatus.resolved || found.status === ModerationCaseStatus.closed_by_admin) {
      throw new BadRequestException("По закрытому кейсу нельзя вынести новое решение.");
    }
    if (found.status === ModerationCaseStatus.escalated && !this.isAdmin(user)) {
      throw new ForbiddenException("Эскалированный кейс решает администратор.");
    }

    const now = new Date();
    if (!this.isAdmin(user) && (found.lockedById !== user.id || !found.lockedUntil || found.lockedUntil <= now)) {
      throw new ForbiddenException("Перед решением модератор должен взять кейс в работу.");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const decision = await tx.moderationDecision.create({
        data: {
          caseId: found.id,
          actorId: user.id,
          actorRole: this.isAdmin(user) ? "admin" : "moderator",
          type: input.type,
          reasonCode: input.reasonCode,
          comment: input.comment,
        },
      });

      if (input.type === ModerationDecisionType.remove_content) {
        await this.removeModeratedEntity(tx, found);
        await tx.sanction.create({
          data: {
            caseId: found.id,
            decisionId: decision.id,
            type: SanctionType.content_removal,
            targetType: found.entityType,
            targetId: found.entityId,
            appliedById: user.id,
            parameters: { reasonCode: input.reasonCode, comment: input.comment },
          },
        });
      }

      if (input.type === ModerationDecisionType.warn_company) {
        if (!found.entityCompanyId) {
          throw new BadRequestException("У автора сущности нет компании для предупреждения.");
        }
        await tx.sanction.create({
          data: {
            caseId: found.id,
            decisionId: decision.id,
            type: SanctionType.warning,
            targetType: "company",
            targetId: found.entityCompanyId,
            appliedById: user.id,
            parameters: { reasonCode: input.reasonCode, comment: input.comment },
          },
        });
      }

      const nextStatus =
        input.type === ModerationDecisionType.escalate_to_admin
          ? ModerationCaseStatus.escalated
          : ModerationCaseStatus.resolved;

      await tx.complaint.updateMany({
        where: { caseId: found.id },
        data: { status: nextStatus === ModerationCaseStatus.resolved ? ComplaintStatus.resolved : ComplaintStatus.pending },
      });

      const updatedCase = await tx.moderationCase.update({
        where: { id: found.id },
        data: {
          status: nextStatus,
          lockedById: null,
          lockedUntil: null,
          closedAt: nextStatus === ModerationCaseStatus.resolved ? new Date() : null,
        },
        include: moderationCaseInclude,
      });

      return { decision, updatedCase };
    });

    await this.auditLog.record({
      actorId: user.id,
      action: `moderation.case.${input.type}`,
      entityType: "ModerationCase",
      entityId: found.id,
      comment: input.comment,
      payload: { reasonCode: input.reasonCode, entityType: found.entityType, entityId: found.entityId },
    });

    await this.notifyDecision(result.updatedCase, result.decision).catch(() => undefined);

    return (await this.enrichCases([result.updatedCase]))[0];
  }

  private assertFunctionalAccess(user: RequestUser) {
    if (!user.company || !canOpenFunctionalSections(user.company)) {
      throw new ForbiddenException("Доступ к разделу ограничен. Активируйте подписку в кабинете.");
    }
  }

  private async loadPublishedEntity(entityType: ModeratedEntityType, entityId: string): Promise<EntityResolution> {
    if (entityType === "news_comment") {
      const comment = await this.prisma.comment.findUnique({
        where: { id: entityId },
        include: {
          newsPost: { select: { status: true } },
          user: { select: { id: true, companyId: true } },
        },
      });
      if (
        !comment ||
        comment.status !== CommentStatus.published ||
        comment.newsPost.status !== ContentStatus.published
      ) {
        throw new NotFoundException("Комментарий не найден или недоступен для жалобы.");
      }
      return { type: "news_comment", authorUserId: comment.userId, authorCompanyId: comment.user.companyId };
    }

    if (entityType === "news_post") {
      const post = await this.prisma.newsPost.findUnique({
        where: { id: entityId },
        select: { id: true, status: true, createdById: true },
      });
      if (!post || post.status !== ContentStatus.published) {
        throw new NotFoundException("Новость не найдена или недоступна для жалобы.");
      }
      return { type: "news_post", authorUserId: post.createdById, authorCompanyId: null };
    }

    const article = await this.prisma.knowledgeBaseArticle.findUnique({
      where: { id: entityId },
      select: { id: true, status: true, createdById: true },
    });
    if (!article || article.status !== ContentStatus.published) {
      throw new NotFoundException("Статья базы знаний не найдена или недоступна для жалобы.");
    }
    return { type: "knowledge_article", authorUserId: article.createdById, authorCompanyId: null };
  }

  private async removeModeratedEntity(tx: Prisma.TransactionClient, found: ModerationCaseWithRelations) {
    if (found.entityType === "news_comment") {
      await tx.comment.update({
        where: { id: found.entityId },
        data: { status: CommentStatus.hidden_by_moderator },
      });
      return;
    }

    if (found.entityType === "news_post") {
      const post = await tx.newsPost.findUnique({ where: { id: found.entityId }, select: { status: true } });
      if (!post) {
        throw new BadRequestException("Новость уже удалена.");
      }
      await tx.newsPost.update({
        where: { id: found.entityId },
        data: { status: ContentStatus.draft },
      });
      return;
    }

    if (found.entityType === "knowledge_article") {
      const article = await tx.knowledgeBaseArticle.findUnique({
        where: { id: found.entityId },
        select: { status: true },
      });
      if (!article) {
        throw new BadRequestException("Статья базы знаний уже удалена.");
      }
      await tx.knowledgeBaseArticle.update({
        where: { id: found.entityId },
        data: { status: ContentStatus.draft },
      });
      return;
    }

    throw new BadRequestException("Тип сущности не поддерживается модерацией.");
  }

  private async notifyDecision(
    found: ModerationCaseWithRelations,
    decision: { id: string; type: ModerationDecisionType; reasonCode: string },
  ) {
    if (decision.type === ModerationDecisionType.escalate_to_admin) return;

    const entity = await this.getModerationEntity(found);
    const fallbackLink = this.fallbackLinkForEntityType(found.entityType);
    const complaintAuthors = [...new Set(found.complaints.map((complaint) => complaint.authorId))];

    const subject = this.subjectForEntity(found.entityType, entity?.title);

    await Promise.all(
      complaintAuthors.map((userId) =>
        this.notifications.createInApp({
          userId,
          eventType: "moderation.complaint.resolved",
          sourceId: `${decision.id}:${userId}`,
          category: NotificationCategory.moderation,
          title: "Жалоба рассмотрена",
          body: `${subject.complaintBody} рассмотрена.`,
          link: entity?.link ?? fallbackLink,
          payload: { caseId: found.id, decisionId: decision.id, reasonCode: decision.reasonCode },
        }),
      ),
    );

    if (decision.type === ModerationDecisionType.remove_content && found.entityAuthorId) {
      await this.notifications.createInApp({
        userId: found.entityAuthorId,
        eventType: "moderation.content.removed",
        sourceId: decision.id,
        category: NotificationCategory.moderation,
        title: subject.removalTitle,
        body: subject.removalBody,
        link: entity?.link ?? fallbackLink,
        payload: { caseId: found.id, decisionId: decision.id },
      });
    }

    if (decision.type === ModerationDecisionType.warn_company && found.entityAuthorId) {
      await this.notifications.createInApp({
        userId: found.entityAuthorId,
        eventType: "moderation.warning.issued",
        sourceId: decision.id,
        category: NotificationCategory.moderation,
        title: "Предупреждение от модератора",
        body: `${subject.warningBody} вынесено предупреждение компании.`,
        link: "/notifications",
        payload: { caseId: found.id, decisionId: decision.id },
      });
    }
  }

  private subjectForEntity(entityType: string, title: string | undefined) {
    const safeTitle = title ?? "—";
    if (entityType === "news_comment") {
      return {
        complaintBody: `Жалоба по комментарию к новости «${safeTitle}»`,
        removalTitle: "Комментарий снят модератором",
        removalBody: `Ваш комментарий к новости «${safeTitle}» скрыт по итогам модерации.`,
        warningBody: `По комментарию к новости «${safeTitle}»`,
      };
    }
    if (entityType === "news_post") {
      return {
        complaintBody: `Жалоба по новости «${safeTitle}»`,
        removalTitle: "Новость снята модератором",
        removalBody: `Новость «${safeTitle}» снята с публикации по итогам модерации.`,
        warningBody: `По новости «${safeTitle}»`,
      };
    }
    return {
      complaintBody: `Жалоба по статье «${safeTitle}»`,
      removalTitle: "Статья базы знаний снята модератором",
      removalBody: `Статья «${safeTitle}» снята с публикации по итогам модерации.`,
      warningBody: `По статье «${safeTitle}»`,
    };
  }

  private fallbackLinkForEntityType(entityType: string): string {
    if (entityType === "knowledge_article") return "/knowledge-base";
    return "/news";
  }

  private async enrichCases(cases: ModerationCaseWithRelations[]) {
    if (cases.length === 0) return [];

    const commentIds = cases.filter((item) => item.entityType === "news_comment").map((item) => item.entityId);
    const newsPostIds = cases.filter((item) => item.entityType === "news_post").map((item) => item.entityId);
    const articleIds = cases.filter((item) => item.entityType === "knowledge_article").map((item) => item.entityId);

    const [comments, newsPosts, articles] = await Promise.all([
      this.prisma.comment.findMany({
        where: { id: { in: commentIds } },
        include: { newsPost: { select: { id: true, title: true, slug: true } } },
      }),
      this.prisma.newsPost.findMany({
        where: { id: { in: newsPostIds } },
        select: { id: true, title: true, slug: true, status: true },
      }),
      this.prisma.knowledgeBaseArticle.findMany({
        where: { id: { in: articleIds } },
        select: { id: true, title: true, slug: true, status: true },
      }),
    ]);

    const commentMap = new Map(comments.map((comment) => [comment.id, comment]));
    const newsPostMap = new Map(newsPosts.map((item) => [item.id, item]));
    const articleMap = new Map(articles.map((item) => [item.id, item]));

    const userIds = [
      ...cases.flatMap((item) => [
        item.entityAuthorId,
        item.lockedById,
        ...item.complaints.map((complaint) => complaint.authorId),
        ...item.decisions.map((decision) => decision.actorId),
      ]),
    ].filter(Boolean) as string[];
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(userIds)] } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        company: { select: { id: true, organizationName: true } },
      },
    });
    const userMap = new Map<string, UserSummary>(users.map((item) => [item.id, item]));

    return cases.map((item) => {
      const entity = this.buildEntitySummary(item, commentMap, newsPostMap, articleMap);
      return {
        ...item,
        lockedBy: item.lockedById ? userMap.get(item.lockedById) ?? null : null,
        entity:
          entity && entity.type === "news_comment"
            ? { ...entity, author: item.entityAuthorId ? userMap.get(item.entityAuthorId) ?? null : null }
            : entity,
        complaints: item.complaints.map((complaint) => ({
          ...complaint,
          author: userMap.get(complaint.authorId) ?? null,
        })),
        decisions: item.decisions.map((decision) => ({
          ...decision,
          actor: userMap.get(decision.actorId) ?? null,
        })),
      };
    });
  }

  private buildEntitySummary(
    item: ModerationCaseWithRelations,
    commentMap: Map<string, { id: string; text: string; status: CommentStatus; createdAt: Date; newsPost: { id: string; title: string; slug: string } }>,
    newsPostMap: Map<string, { id: string; title: string; slug: string; status: ContentStatus }>,
    articleMap: Map<string, { id: string; title: string; slug: string; status: ContentStatus }>,
  ): ResolvedEntitySummary | null {
    if (item.entityType === "news_comment") {
      const found = commentMap.get(item.entityId);
      if (!found) return null;
      return {
        type: "news_comment",
        id: found.id,
        text: found.text,
        status: found.status,
        createdAt: found.createdAt,
        newsPost: found.newsPost,
      };
    }
    if (item.entityType === "news_post") {
      const found = newsPostMap.get(item.entityId);
      if (!found) return null;
      return { type: "news_post", id: found.id, title: found.title, slug: found.slug, status: found.status };
    }
    if (item.entityType === "knowledge_article") {
      const found = articleMap.get(item.entityId);
      if (!found) return null;
      return {
        type: "knowledge_article",
        id: found.id,
        title: found.title,
        slug: found.slug,
        status: found.status,
      };
    }
    return null;
  }

  private async getModerationEntity(found: ModerationCaseWithRelations): Promise<DecisionLink | null> {
    if (!isModeratedEntityType(found.entityType)) return null;
    if (found.entityType === "news_comment") {
      const comment = await this.prisma.comment.findUnique({
        where: { id: found.entityId },
        include: { newsPost: { select: { id: true, title: true, slug: true } } },
      });
      if (!comment) return null;
      return { title: comment.newsPost.title, link: `/news/${comment.newsPost.slug}` };
    }
    if (found.entityType === "news_post") {
      const post = await this.prisma.newsPost.findUnique({
        where: { id: found.entityId },
        select: { title: true, slug: true },
      });
      if (!post) return null;
      return { title: post.title, link: `/news/${post.slug}` };
    }
    const article = await this.prisma.knowledgeBaseArticle.findUnique({
      where: { id: found.entityId },
      select: { title: true, slug: true },
    });
    if (!article) return null;
    return { title: article.title, link: `/knowledge-base/${article.slug}` };
  }

  private isAdmin(user: RequestUser) {
    return user.platformRoles.includes("admin");
  }
}
