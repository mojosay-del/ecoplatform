import { DiscussionTargetType, ModerationDecisionType, NotificationCategory } from "@prisma/client";
import type { ModeratedEntityType } from "./moderation.schemas";
import { moderatedEntityTypes } from "./moderation.schemas";
import type {
  ModerationDecisionCaseWithRelations,
  ModerationDecisionDeps,
  ModerationDecisionNotificationRecord,
} from "./moderation-decision-workflow.helpers";

type DecisionLink = { title: string; link: string };

export async function notifyDecision(
  deps: ModerationDecisionDeps,
  found: ModerationDecisionCaseWithRelations,
  decision: ModerationDecisionNotificationRecord,
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
