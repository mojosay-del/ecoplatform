import { ForumQuestionStatus, type Prisma } from "@prisma/client";

// Пересчитывает производное состояние вопроса по видимым (не скрытым) ответам:
// answersCount, принятый ответ, статус и solvedAt. Вызывается при любом изменении
// набора ответов (создание/удаление/принятие/скрытие модератором), чтобы лента и
// сортировки оставались согласованными. Скрытый модератором вопрос не «воскрешаем».
export async function recomputeForumQuestionState(tx: Prisma.TransactionClient, questionId: string): Promise<void> {
  const [answers, question] = await Promise.all([
    tx.forumAnswer.findMany({
      where: { questionId, parentAnswerId: null, hidden: false },
      select: { id: true, isAccepted: true },
    }),
    tx.forumQuestion.findUnique({ where: { id: questionId }, select: { status: true, solvedAt: true } }),
  ]);

  const answersCount = answers.length;
  const accepted = answers.find((answer) => answer.isAccepted) ?? null;

  let status: ForumQuestionStatus;
  if (question?.status === ForumQuestionStatus.hidden) {
    status = ForumQuestionStatus.hidden;
  } else if (accepted) {
    status = ForumQuestionStatus.solved;
  } else if (answersCount > 0) {
    status = ForumQuestionStatus.answered;
  } else {
    status = ForumQuestionStatus.open;
  }

  await tx.forumQuestion.update({
    where: { id: questionId },
    data: {
      answersCount,
      acceptedAnswerId: accepted?.id ?? null,
      status,
      solvedAt: status === ForumQuestionStatus.solved ? (question?.solvedAt ?? new Date()) : null,
    },
  });
}
