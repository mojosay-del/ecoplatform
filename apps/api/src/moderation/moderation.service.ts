import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CommentStatus,
  ContentStatus,
  DiscussionTargetType,
  ForumQuestionStatus,
  ListingStatus,
  ModerationCaseStatus,
  ReviewStatus,
} from "@prisma/client";
import { companyHasFunctionalAccess } from "../common/access-policy";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import { AdminActionLogService } from "../common/admin-action-log.service";
import type { PaginationInput } from "../common/pagination";
import type { RequestUser } from "../common/request-user";
import { swallowAndLog } from "../common/silent-catch";
import { MarketplaceReviewsService } from "../marketplace/services/marketplace-reviews.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCacheService } from "../redis/session-cache.service";
import {
  enrichCases,
  getCase as getCaseWorkflow,
  listCases as listCasesWorkflow,
  releaseCaseLock as releaseCaseLockWorkflow,
  takeCaseLock as takeCaseLockWorkflow,
  type ModerationCaseDeps,
} from "./moderation-case.helpers";
import { createDecision as createDecisionWorkflow, type ModerationDecisionDeps } from "./moderation-decision.helpers";
import {
  applyAdminSanction as applyAdminSanctionWorkflow,
  liftSanction as liftSanctionWorkflow,
  type ModerationSanctionDeps,
} from "./moderation-sanction.helpers";
import type {
  adminSanctionInputSchema,
  complaintInputSchema,
  moderationDecisionInputSchema,
  ModeratedEntityType,
  sanctionLiftInputSchema,
} from "./moderation.schemas";
import type { z } from "zod";

const ACTIVE_CASE_STATUSES = [
  ModerationCaseStatus.open,
  ModerationCaseStatus.in_review,
  ModerationCaseStatus.escalated,
];

type EntityResolution = {
  type: ModeratedEntityType;
  authorUserId: string | null;
  authorCompanyId: string | null;
};

type ComplaintInput = z.infer<typeof complaintInputSchema>;
type ModerationDecisionInput = z.infer<typeof moderationDecisionInputSchema>;
type AdminSanctionInput = z.infer<typeof adminSanctionInputSchema>;
type SanctionLiftInput = z.infer<typeof sanctionLiftInputSchema>;

@Injectable()
export class ModerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly notifications: NotificationsService,
    private readonly settings: PlatformSettingsService,
    private readonly sessionCache: SessionCacheService,
    private readonly reviews: MarketplaceReviewsService,
  ) {}

  async createComplaint(input: ComplaintInput, user: RequestUser) {
    this.assertFunctionalAccess(user);

    const entity = await this.loadPublishedEntity(input.entityType, input.entityId);
    if (entity.authorUserId === user.id) {
      throw new ForbiddenException("Нельзя пожаловаться на свой материал.");
    }

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

  async listCases(paginationInput: PaginationInput = {}) {
    return listCasesWorkflow(this.moderationCaseDeps(), paginationInput);
  }

  async getCase(id: string) {
    return getCaseWorkflow(this.moderationCaseDeps(), id);
  }

  async takeCaseLock(id: string, user: RequestUser) {
    return takeCaseLockWorkflow(this.moderationCaseDeps(), id, user);
  }

  async releaseCaseLock(id: string, user: RequestUser) {
    return releaseCaseLockWorkflow(this.moderationCaseDeps(), id, user);
  }

  async createDecision(id: string, input: ModerationDecisionInput, user: RequestUser) {
    const updatedCase = await createDecisionWorkflow(this.moderationDecisionDeps(), id, input, user);
    // Скрытие отзыва меняет рейтинг компании — пересчитываем кэш по-яндексовски.
    if (input.type === "remove_content" && updatedCase.entityType === "marketplace_review") {
      const review = await this.prisma.marketplaceReview.findUnique({
        where: { id: updatedCase.entityId },
        select: { toCompanyId: true },
      });
      if (review) {
        await this.reviews
          .recomputeCompanyRating(review.toCompanyId)
          .catch(swallowAndLog("moderation.review.recomputeRating", { reviewId: updatedCase.entityId }));
      }
    }
    return (await enrichCases(this.moderationCaseDeps(), [updatedCase]))[0];
  }

  async applyAdminSanction(id: string, input: AdminSanctionInput, user: RequestUser) {
    const updatedCase = await applyAdminSanctionWorkflow(this.moderationSanctionDeps(), id, input, user);
    return (await enrichCases(this.moderationCaseDeps(), [updatedCase]))[0];
  }

  async liftSanction(id: string, input: SanctionLiftInput, user: RequestUser) {
    return liftSanctionWorkflow(this.moderationSanctionDeps(), id, input, user);
  }

  private moderationCaseDeps(): ModerationCaseDeps {
    return {
      prisma: this.prisma,
      auditLog: this.auditLog,
      settings: this.settings,
    };
  }

  private moderationSanctionDeps(): ModerationSanctionDeps {
    return {
      prisma: this.prisma,
      auditLog: this.auditLog,
      notifications: this.notifications,
      sessionCache: this.sessionCache,
    };
  }

  private moderationDecisionDeps(): ModerationDecisionDeps {
    return {
      prisma: this.prisma,
      auditLog: this.auditLog,
      notifications: this.notifications,
    };
  }

  // Подать жалобу может только пользователь компании с активным доступом
  // (НЕ платформенный стафф — он модерирует, а не жалуется). Поэтому используем
  // companyHasFunctionalAccess (без staff-исключения), а не общий гейт разделов.
  private assertFunctionalAccess(user: RequestUser) {
    if (!companyHasFunctionalAccess(user)) {
      throw new ForbiddenException("Доступ к разделу ограничен. Активируйте подписку в кабинете.");
    }
  }

  private async loadPublishedEntity(entityType: ModeratedEntityType, entityId: string): Promise<EntityResolution> {
    if (entityType === "news_comment") {
      const comment = await this.prisma.comment.findUnique({
        where: { id: entityId },
        include: {
          discussion: { select: { targetType: true, targetId: true } },
          user: { select: { id: true, companyId: true } },
        },
      });
      if (
        !comment ||
        comment.status !== CommentStatus.published ||
        comment.discussion.targetType !== DiscussionTargetType.news_post
      ) {
        throw new NotFoundException("Комментарий не найден или недоступен для жалобы.");
      }
      const newsPost = await this.prisma.newsPost.findUnique({
        where: { id: comment.discussion.targetId },
        select: { status: true },
      });
      if (!newsPost || newsPost.status !== ContentStatus.published) {
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

    if (entityType === "knowledge_article") {
      const article = await this.prisma.knowledgeBaseArticle.findUnique({
        where: { id: entityId },
        select: { id: true, status: true, createdById: true },
      });
      if (!article || article.status !== ContentStatus.published) {
        throw new NotFoundException("Статья базы знаний не найдена или недоступна для жалобы.");
      }
      return { type: "knowledge_article", authorUserId: article.createdById, authorCompanyId: null };
    }

    if (entityType === "marketplace_listing") {
      const listing = await this.prisma.marketplaceListing.findUnique({
        where: { id: entityId },
        select: { id: true, status: true, createdById: true, sellerCompanyId: true },
      });
      if (!listing || listing.status !== ListingStatus.active) {
        throw new NotFoundException("Объявление не найдено или недоступно для жалобы.");
      }
      return {
        type: "marketplace_listing",
        authorUserId: listing.createdById,
        authorCompanyId: listing.sellerCompanyId,
      };
    }

    if (entityType === "forum_question") {
      const question = await this.prisma.forumQuestion.findUnique({
        where: { id: entityId },
        select: { id: true, status: true, authorId: true, authorCompanyId: true },
      });
      if (!question || question.status === ForumQuestionStatus.hidden) {
        throw new NotFoundException("Вопрос форума не найден или недоступен для жалобы.");
      }
      return { type: "forum_question", authorUserId: question.authorId, authorCompanyId: question.authorCompanyId };
    }

    if (entityType === "forum_answer") {
      const answer = await this.prisma.forumAnswer.findUnique({
        where: { id: entityId },
        select: { id: true, hidden: true, authorId: true, authorCompanyId: true },
      });
      if (!answer || answer.hidden) {
        throw new NotFoundException("Ответ форума не найден или недоступен для жалобы.");
      }
      return { type: "forum_answer", authorUserId: answer.authorId, authorCompanyId: answer.authorCompanyId };
    }

    // Остаётся marketplace_review (enum жалобы ограничен moderatedEntityTypes).
    const review = await this.prisma.marketplaceReview.findUnique({
      where: { id: entityId },
      select: { id: true, status: true, createdById: true, fromCompanyId: true },
    });
    if (!review || review.status !== ReviewStatus.published) {
      throw new NotFoundException("Отзыв не найден или недоступен для жалобы.");
    }
    return { type: "marketplace_review", authorUserId: review.createdById, authorCompanyId: review.fromCompanyId };
  }
}
