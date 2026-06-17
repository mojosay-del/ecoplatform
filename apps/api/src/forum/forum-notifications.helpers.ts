import { NotificationCategory } from "@prisma/client";
import { swallowAndLog } from "../common/silent-catch";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";

export type ForumNotificationDeps = {
  prisma: PrismaService;
  notifications: NotificationsService;
};

function questionLink(questionId: string): string {
  return `/forum/q/${questionId}`;
}

function truncate(text: string, max = 80): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// Новый ответ → автору вопроса и подписчикам темы (кроме самого ответившего).
// Дедуп per-user обеспечивает upsert в createInApp по (domainEventId, userId).
export async function notifyForumNewAnswer(
  deps: ForumNotificationDeps,
  params: {
    questionId: string;
    questionTitle: string;
    questionAuthorId: string;
    answerId: string;
    answerAuthorId: string;
  },
): Promise<void> {
  const recipients = new Set<string>();
  if (params.questionAuthorId !== params.answerAuthorId) {
    recipients.add(params.questionAuthorId);
  }
  const subscribers = await deps.prisma.forumSubscription.findMany({
    where: { questionId: params.questionId, userId: { not: params.answerAuthorId } },
    select: { userId: true },
  });
  subscribers.forEach((subscription) => recipients.add(subscription.userId));

  await Promise.all(
    [...recipients].map((userId) =>
      deps.notifications
        .createInApp({
          userId,
          category: NotificationCategory.forum,
          eventType: userId === params.questionAuthorId ? "forum.answer.created" : "forum.subscribed.answer",
          sourceId: params.answerId,
          domainEventId: `forum.answer.created:${params.answerId}`,
          title: "Новый ответ на форуме",
          body: `На вопрос «${truncate(params.questionTitle)}» добавлен ответ.`,
          link: questionLink(params.questionId),
        })
        .catch(swallowAndLog("forum.notifyNewAnswer", { userId, answerId: params.answerId })),
    ),
  );
}

// Ответ отмечен решением → автору ответа (если не он сам отметил).
export async function notifyForumAnswerAccepted(
  deps: ForumNotificationDeps,
  params: { questionId: string; questionTitle: string; answerId: string; answerAuthorId: string; actorId: string },
): Promise<void> {
  if (params.answerAuthorId === params.actorId) {
    return;
  }
  await deps.notifications
    .createInApp({
      userId: params.answerAuthorId,
      category: NotificationCategory.forum,
      eventType: "forum.answer.accepted",
      sourceId: params.answerId,
      domainEventId: `forum.answer.accepted:${params.answerId}`,
      title: "Ваш ответ отметили решением",
      body: `Ответ на вопрос «${truncate(params.questionTitle)}» выбран лучшим.`,
      link: questionLink(params.questionId),
    })
    .catch(swallowAndLog("forum.notifyAnswerAccepted", { answerId: params.answerId }));
}
