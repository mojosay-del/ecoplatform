import { BadRequestException } from "@nestjs/common";
import {
  CommentStatus,
  ContentStatus,
  ForumQuestionStatus,
  ListingStatus,
  OfferStatus,
  ReviewStatus,
  type Prisma,
} from "@prisma/client";
import { recomputeForumQuestionState } from "../forum/forum-state.helpers";
import type { ModerationDecisionCaseWithRelations } from "./moderation-decision-workflow.helpers";

export async function removeModeratedEntity(tx: Prisma.TransactionClient, found: ModerationDecisionCaseWithRelations) {
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
