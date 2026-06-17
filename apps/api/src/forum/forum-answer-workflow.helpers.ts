import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ForumQuestionStatus } from "@prisma/client";
import { isPlatformStaff } from "../common/access-policy";
import type { RequestUser } from "../common/request-user";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { canManageForumContent } from "./forum-question-workflow.helpers";
import { notifyForumAnswerAccepted, notifyForumNewAnswer } from "./forum-notifications.helpers";
import { recomputeForumQuestionState } from "./forum-state.helpers";

export type ForumAnswerWorkflowDeps = {
  prisma: PrismaService;
  notifications: NotificationsService;
};

export async function createForumAnswer(
  deps: ForumAnswerWorkflowDeps,
  questionId: string,
  body: string,
  author: { id: string; companyId: string | null },
): Promise<{ id: string }> {
  const question = await deps.prisma.forumQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, title: true, authorId: true, status: true },
  });
  if (!question || question.status === ForumQuestionStatus.hidden) {
    throw new NotFoundException("Вопрос не найден.");
  }

  const answer = await deps.prisma.$transaction(async (tx) => {
    const created = await tx.forumAnswer.create({
      data: {
        questionId,
        authorId: author.id,
        authorCompanyId: author.companyId,
        body,
      },
      select: { id: true },
    });
    await recomputeForumQuestionState(tx, questionId);
    // Ответивший автоматически подписывается на тему.
    await tx.forumSubscription.upsert({
      where: { questionId_userId: { questionId, userId: author.id } },
      create: { questionId, userId: author.id },
      update: {},
    });
    return created;
  });

  await notifyForumNewAnswer(deps, {
    questionId,
    questionTitle: question.title,
    questionAuthorId: question.authorId,
    answerId: answer.id,
    answerAuthorId: author.id,
  });

  return answer;
}

export async function updateForumAnswer(
  deps: ForumAnswerWorkflowDeps,
  answerId: string,
  body: string,
  user: RequestUser,
): Promise<{ id: string }> {
  const answer = await deps.prisma.forumAnswer.findUnique({
    where: { id: answerId },
    select: { id: true, authorId: true, hidden: true },
  });
  if (!answer || answer.hidden) {
    throw new NotFoundException("Ответ не найден.");
  }
  // Править текст ответа может только его автор (модератор скрывает/удаляет).
  if (answer.authorId !== user.id) {
    throw new ForbiddenException("Редактировать можно только свой ответ.");
  }
  await deps.prisma.forumAnswer.update({ where: { id: answerId }, data: { body } });
  return { id: answerId };
}

export async function deleteForumAnswer(
  deps: ForumAnswerWorkflowDeps,
  answerId: string,
  user: RequestUser,
): Promise<{ ok: true }> {
  const answer = await deps.prisma.forumAnswer.findUnique({
    where: { id: answerId },
    select: { id: true, authorId: true, questionId: true },
  });
  if (!answer) {
    throw new NotFoundException("Ответ не найден.");
  }
  if (!canManageForumContent(user, answer.authorId)) {
    throw new ForbiddenException("Удалить можно только свой ответ.");
  }
  await deps.prisma.$transaction(async (tx) => {
    await tx.forumAnswer.delete({ where: { id: answerId } });
    await recomputeForumQuestionState(tx, answer.questionId);
  });
  return { ok: true };
}

// Голос «полезно» (toggle): второй вызов снимает голос. Своя запись запрещена.
export async function toggleForumVote(
  deps: ForumAnswerWorkflowDeps,
  answerId: string,
  user: RequestUser,
): Promise<{ voted: boolean; votesCount: number }> {
  const answer = await deps.prisma.forumAnswer.findUnique({
    where: { id: answerId },
    select: { id: true, authorId: true, hidden: true },
  });
  if (!answer || answer.hidden) {
    throw new NotFoundException("Ответ не найден.");
  }
  if (answer.authorId === user.id) {
    throw new BadRequestException("Нельзя голосовать за свой ответ.");
  }

  const votesCount = await deps.prisma.$transaction(async (tx) => {
    const existing = await tx.forumAnswerVote.findUnique({
      where: { answerId_userId: { answerId, userId: user.id } },
      select: { id: true },
    });
    if (existing) {
      await tx.forumAnswerVote.delete({ where: { id: existing.id } });
      const updated = await tx.forumAnswer.update({
        where: { id: answerId },
        data: { votesCount: { decrement: 1 } },
        select: { votesCount: true },
      });
      return { voted: false, votesCount: updated.votesCount };
    }
    await tx.forumAnswerVote.create({ data: { answerId, userId: user.id } });
    const updated = await tx.forumAnswer.update({
      where: { id: answerId },
      data: { votesCount: { increment: 1 } },
      select: { votesCount: true },
    });
    return { voted: true, votesCount: updated.votesCount };
  });

  return votesCount;
}

// Отметить ответ решением. Может автор вопроса (своего) либо платформенный стафф
// (на любом вопросе) — ТЗ §4. Снимает прошлый принятый ответ, ставит solved.
export async function acceptForumAnswer(
  deps: ForumAnswerWorkflowDeps,
  questionId: string,
  answerId: string,
  user: RequestUser,
): Promise<{ ok: true }> {
  const question = await deps.prisma.forumQuestion.findUnique({
    where: { id: questionId },
    select: { id: true, title: true, authorId: true, status: true },
  });
  if (!question || question.status === ForumQuestionStatus.hidden) {
    throw new NotFoundException("Вопрос не найден.");
  }
  if (question.authorId !== user.id && !isPlatformStaff(user)) {
    throw new ForbiddenException("Отметить решение может только автор вопроса.");
  }

  const answer = await deps.prisma.forumAnswer.findUnique({
    where: { id: answerId },
    select: { id: true, questionId: true, authorId: true, hidden: true },
  });
  if (!answer || answer.questionId !== questionId || answer.hidden) {
    throw new NotFoundException("Ответ не найден.");
  }

  await deps.prisma.$transaction(async (tx) => {
    await tx.forumAnswer.updateMany({ where: { questionId }, data: { isAccepted: false } });
    await tx.forumAnswer.update({ where: { id: answerId }, data: { isAccepted: true } });
    await recomputeForumQuestionState(tx, questionId);
  });

  await notifyForumAnswerAccepted(deps, {
    questionId,
    questionTitle: question.title,
    answerId,
    answerAuthorId: answer.authorId,
    actorId: user.id,
  });

  return { ok: true };
}
