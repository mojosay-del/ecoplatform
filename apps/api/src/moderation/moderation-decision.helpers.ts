import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import {
  CommentStatus,
  ComplaintStatus,
  ContentStatus,
  DiscussionTargetType,
  ForumQuestionStatus,
  ListingStatus,
  ModerationCaseStatus,
  ModerationDecisionType,
  NotificationCategory,
  OfferStatus,
  ReviewStatus,
  SanctionType,
  type Prisma,
} from "@prisma/client";
import { recomputeForumQuestionState } from "../forum/forum-state.helpers";
import type { z } from "zod";
import { isPlatformAdmin } from "../common/access-policy";
import type { AdminActionLogService } from "../common/admin-action-log.service";
import type { RequestUser } from "../common/request-user";
import { swallowAndLog } from "../common/silent-catch";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { moderationDecisionInputSchema, ModeratedEntityType } from "./moderation.schemas";
import { moderatedEntityTypes } from "./moderation.schemas";

type ModerationDecisionInput = z.infer<typeof moderationDecisionInputSchema>;
type DecisionLink = { title: string; link: string };

export type ModerationDecisionDeps = {
  prisma: PrismaService;
  auditLog: AdminActionLogService;
  notifications: NotificationsService;
};

const moderationDecisionCaseInclude = {
  complaints: { orderBy: { createdAt: "asc" } },
  decisions: { orderBy: { createdAt: "asc" } },
  sanctions: { orderBy: { appliedAt: "asc" } },
} satisfies Prisma.ModerationCaseInclude;

export type ModerationDecisionCaseWithRelations = Prisma.ModerationCaseGetPayload<{
  include: typeof moderationDecisionCaseInclude;
}>;

export async function createDecision(
  deps: ModerationDecisionDeps,
  id: string,
  input: ModerationDecisionInput,
  user: RequestUser,
): Promise<ModerationDecisionCaseWithRelations> {
  const found = await deps.prisma.moderationCase.findUnique({
    where: { id },
    include: moderationDecisionCaseInclude,
  });
  if (!found) {
    throw new NotFoundException("Кейс модерации не найден.");
  }
  if (found.status === ModerationCaseStatus.resolved || found.status === ModerationCaseStatus.closed_by_admin) {
    throw new BadRequestException("По закрытому кейсу нельзя вынести новое решение.");
  }
  if (found.status === ModerationCaseStatus.escalated && !isPlatformAdmin(user)) {
    throw new ForbiddenException("Эскалированный кейс решает администратор.");
  }

  const now = new Date();
  if (!isPlatformAdmin(user) && (found.lockedById !== user.id || !found.lockedUntil || found.lockedUntil <= now)) {
    throw new ForbiddenException("Перед решением модератор должен взять кейс в работу.");
  }

  const result = await deps.prisma.$transaction(async (tx) => {
    const decision = await tx.moderationDecision.create({
      data: {
        caseId: found.id,
        actorId: user.id,
        actorRole: isPlatformAdmin(user) ? "admin" : "moderator",
        type: input.type,
        reasonCode: input.reasonCode,
        comment: input.comment,
      },
    });

    if (input.type === ModerationDecisionType.remove_content) {
      await removeModeratedEntity(tx, found);
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
      data: {
        status: nextStatus === ModerationCaseStatus.resolved ? ComplaintStatus.resolved : ComplaintStatus.pending,
      },
    });

    const updatedCase = await tx.moderationCase.update({
      where: { id: found.id },
      data: {
        status: nextStatus,
        lockedById: null,
        lockedUntil: null,
        closedAt: nextStatus === ModerationCaseStatus.resolved ? new Date() : null,
      },
      include: moderationDecisionCaseInclude,
    });

    return { decision, updatedCase };
  });

  await deps.auditLog.record({
    actorId: user.id,
    action: `moderation.case.${input.type}`,
    entityType: "ModerationCase",
    entityId: found.id,
    comment: input.comment,
    payload: { reasonCode: input.reasonCode, entityType: found.entityType, entityId: found.entityId },
  });

  await notifyDecision(deps, result.updatedCase, result.decision).catch(
    swallowAndLog("moderation.decision.notify", { caseId: result.updatedCase.id }),
  );

  return result.updatedCase;
}

async function removeModeratedEntity(tx: Prisma.TransactionClient, found: ModerationDecisionCaseWithRelations) {
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

  if (found.entityType === "marketplace_listing") {
    const listing = await tx.marketplaceListing.findUnique({
      where: { id: found.entityId },
      select: { status: true },
    });
    if (!listing) {
      throw new BadRequestException("Объявление уже удалено.");
    }
    // archived убирает объявление из ленты; archiveReason запрещает переподачу.
    const now = new Date();
    await tx.marketplaceListing.update({
      where: { id: found.entityId },
      data: { status: ListingStatus.archived, archiveReason: "removed_by_moderator", archivedAt: now },
    });
    await tx.offer.updateMany({
      where: {
        listingId: found.entityId,
        status: { in: [OfferStatus.active, OfferStatus.accepted] },
        dealResult: null,
      },
      data: { status: OfferStatus.declined, resolvedAt: now },
    });
    return;
  }

  if (found.entityType === "marketplace_review") {
    const review = await tx.marketplaceReview.findUnique({
      where: { id: found.entityId },
      select: { status: true },
    });
    if (!review) {
      throw new BadRequestException("Отзыв уже удалён.");
    }
    // Пересчёт рейтинга компании делает ModerationService после коммита.
    await tx.marketplaceReview.update({
      where: { id: found.entityId },
      data: { status: ReviewStatus.hidden_by_moderator },
    });
    return;
  }

  if (found.entityType === "forum_question") {
    const question = await tx.forumQuestion.findUnique({ where: { id: found.entityId }, select: { id: true } });
    if (!question) {
      throw new BadRequestException("Вопрос форума уже удалён.");
    }
    await tx.forumQuestion.update({ where: { id: found.entityId }, data: { status: ForumQuestionStatus.hidden } });
    return;
  }

  if (found.entityType === "forum_answer") {
    const answer = await tx.forumAnswer.findUnique({ where: { id: found.entityId }, select: { questionId: true } });
    if (!answer) {
      throw new BadRequestException("Ответ форума уже удалён.");
    }
    await tx.forumAnswer.update({ where: { id: found.entityId }, data: { hidden: true } });
    // Скрытие ответа меняет счётчики/принятый ответ — пересчитываем состояние вопроса.
    await recomputeForumQuestionState(tx, answer.questionId);
    return;
  }

  throw new BadRequestException("Тип сущности не поддерживается модерацией.");
}

async function notifyDecision(
  deps: ModerationDecisionDeps,
  found: ModerationDecisionCaseWithRelations,
  decision: { id: string; type: ModerationDecisionType; reasonCode: string },
) {
  if (decision.type === ModerationDecisionType.escalate_to_admin) return;

  const entity = await getModerationEntity(deps, found);
  const fallbackLink = fallbackLinkForEntityType(found.entityType);
  const complaintAuthors = [...new Set(found.complaints.map((complaint) => complaint.authorId))];

  const subject = subjectForEntity(found.entityType, entity?.title);

  await Promise.all(
    complaintAuthors.map((userId) =>
      deps.notifications.createInApp({
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
    await deps.notifications.createInApp({
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
    await deps.notifications.createInApp({
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

function subjectForEntity(entityType: string, title: string | undefined) {
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
  if (entityType === "knowledge_article") {
    return {
      complaintBody: `Жалоба по статье «${safeTitle}»`,
      removalTitle: "Статья базы знаний снята модератором",
      removalBody: `Статья «${safeTitle}» снята с публикации по итогам модерации.`,
      warningBody: `По статье «${safeTitle}»`,
    };
  }
  if (entityType === "marketplace_listing") {
    return {
      complaintBody: `Жалоба по объявлению «${safeTitle}»`,
      removalTitle: "Объявление снято модератором",
      removalBody: `Ваше объявление «${safeTitle}» снято с площадки по итогам модерации.`,
      warningBody: `По объявлению «${safeTitle}»`,
    };
  }
  if (entityType === "forum_question") {
    return {
      complaintBody: `Жалоба по вопросу «${safeTitle}»`,
      removalTitle: "Вопрос снят модератором",
      removalBody: `Ваш вопрос «${safeTitle}» скрыт по итогам модерации.`,
      warningBody: `По вопросу «${safeTitle}»`,
    };
  }
  if (entityType === "forum_answer") {
    return {
      complaintBody: `Жалоба по ответу на форуме («${safeTitle}»)`,
      removalTitle: "Ответ снят модератором",
      removalBody: `Ваш ответ на вопрос «${safeTitle}» скрыт по итогам модерации.`,
      warningBody: `По ответу на вопрос «${safeTitle}»`,
    };
  }
  // marketplace_review
  return {
    complaintBody: "Жалоба на отзыв",
    removalTitle: "Отзыв скрыт модератором",
    removalBody: "Ваш отзыв скрыт по итогам модерации.",
    warningBody: "По отзыву",
  };
}

function fallbackLinkForEntityType(entityType: string): string {
  if (entityType === "knowledge_article") return "/knowledge-base";
  if (entityType === "marketplace_listing" || entityType === "marketplace_review") return "/marketplace";
  if (entityType === "forum_question" || entityType === "forum_answer") return "/forum";
  return "/news";
}

async function getModerationEntity(
  deps: ModerationDecisionDeps,
  found: ModerationDecisionCaseWithRelations,
): Promise<DecisionLink | null> {
  if (!isModeratedEntityType(found.entityType)) return null;
  if (found.entityType === "news_comment") {
    const comment = await deps.prisma.comment.findUnique({
      where: { id: found.entityId },
      include: { discussion: { select: { targetType: true, targetId: true } } },
    });
    if (!comment || comment.discussion.targetType !== DiscussionTargetType.news_post) return null;
    const newsPost = await deps.prisma.newsPost.findUnique({
      where: { id: comment.discussion.targetId },
      select: { title: true, slug: true },
    });
    if (!newsPost) return null;
    return { title: newsPost.title, link: `/news/${newsPost.slug}` };
  }
  if (found.entityType === "news_post") {
    const post = await deps.prisma.newsPost.findUnique({
      where: { id: found.entityId },
      select: { title: true, slug: true },
    });
    if (!post) return null;
    return { title: post.title, link: `/news/${post.slug}` };
  }
  if (found.entityType === "knowledge_article") {
    const article = await deps.prisma.knowledgeBaseArticle.findUnique({
      where: { id: found.entityId },
      select: { title: true, slug: true },
    });
    if (!article) return null;
    return { title: article.title, link: `/knowledge-base/${article.slug}` };
  }

  if (found.entityType === "marketplace_listing") {
    const listing = await deps.prisma.marketplaceListing.findUnique({
      where: { id: found.entityId },
      select: {
        description: true,
        positions: { orderBy: { position: "asc" }, select: { nomenclature: { select: { name: true } } } },
      },
    });
    if (!listing) return null;
    const names = listing.positions.map((position) => position.nomenclature.name).filter(Boolean);
    const title = names.length > 0 ? names.join(", ") : listing.description?.trim()?.slice(0, 80) || "Объявление";
    return { title, link: `/marketplace/${found.entityId}` };
  }

  if (found.entityType === "forum_question") {
    const question = await deps.prisma.forumQuestion.findUnique({
      where: { id: found.entityId },
      select: { title: true },
    });
    if (!question) return null;
    return { title: question.title, link: `/forum/q/${found.entityId}` };
  }

  if (found.entityType === "forum_answer") {
    const answer = await deps.prisma.forumAnswer.findUnique({
      where: { id: found.entityId },
      select: { question: { select: { id: true, title: true } } },
    });
    if (!answer) return null;
    return { title: answer.question.title, link: `/forum/q/${answer.question.id}` };
  }

  // marketplace_review — отдельной страницы отзыва нет, ведём в раздел сделок.
  return { title: "отзыв", link: "/marketplace/offers" };
}

function isModeratedEntityType(value: string): value is ModeratedEntityType {
  return (moderatedEntityTypes as readonly string[]).includes(value);
}
