import type { ForumAnswer, ForumQuestion, ForumQuestionType, ForumRawMaterial } from "@prisma/client";
import type {
  ForumAdminQuestionItem,
  ForumAnswerItem,
  ForumAnswerReplyItem,
  ForumQuestionDetail,
  ForumQuestionListItem,
  ForumQuestionStatus,
  ForumTaxonomyValue,
} from "@ecoplatform/shared";
import { fallbackReputation, type ForumReputationMap } from "./forum-reputation.helpers";

export type ForumQuestionRow = ForumQuestion & {
  rawMaterial?: ForumRawMaterial | null;
  questionType?: ForumQuestionType | null;
  answers?: ForumAnswerRow[];
};

export type ForumAnswerRow = ForumAnswer & {
  replies?: ForumAnswer[];
};

export function toTaxonomyValue(value: ForumRawMaterial | ForumQuestionType): ForumTaxonomyValue {
  return { id: value.id, label: value.label, position: value.position };
}

function taxonomyOrNull(value: ForumRawMaterial | ForumQuestionType | null | undefined): ForumTaxonomyValue | null {
  return value ? toTaxonomyValue(value) : null;
}

// Однострочное превью тела (схлопываем пробелы, обрезаем по длине).
export function forumExcerpt(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export function mapForumQuestionListItem(row: ForumQuestionRow, reputation: ForumReputationMap): ForumQuestionListItem {
  const accepted = row.answers?.find((answer) => answer.isAccepted) ?? null;
  return {
    id: row.id,
    title: row.title,
    excerpt: forumExcerpt(row.body),
    status: row.status as ForumQuestionStatus,
    rawMaterial: taxonomyOrNull(row.rawMaterial),
    questionType: taxonomyOrNull(row.questionType),
    answersCount: row.answersCount,
    views: row.views,
    topVotes: accepted?.votesCount ?? 0,
    acceptedAnswerExcerpt: accepted ? forumExcerpt(accepted.body, 180) : null,
    author: reputation.get(row.authorId) ?? fallbackReputation(row.authorId),
    createdAt: row.createdAt.toISOString(),
  };
}

type AnswerContext = {
  votedAnswerIds: Set<string>;
  canManageAnswer: (authorId: string) => boolean;
};

export function mapForumAnswerReply(
  row: ForumAnswer,
  reputation: ForumReputationMap,
  ctx: Pick<AnswerContext, "canManageAnswer">,
): ForumAnswerReplyItem {
  return {
    id: row.id,
    body: row.body,
    canManage: ctx.canManageAnswer(row.authorId),
    author: reputation.get(row.authorId) ?? fallbackReputation(row.authorId),
    createdAt: row.createdAt.toISOString(),
  };
}

export function mapForumAnswer(
  row: ForumAnswerRow,
  reputation: ForumReputationMap,
  ctx: AnswerContext,
): ForumAnswerItem {
  return {
    id: row.id,
    body: row.body,
    votesCount: row.votesCount,
    isAccepted: row.isAccepted,
    votedByMe: ctx.votedAnswerIds.has(row.id),
    canManage: ctx.canManageAnswer(row.authorId),
    author: reputation.get(row.authorId) ?? fallbackReputation(row.authorId),
    createdAt: row.createdAt.toISOString(),
    replies: (row.replies ?? []).map((reply) => mapForumAnswerReply(reply, reputation, ctx)),
  };
}

type QuestionDetailContext = AnswerContext & {
  isAuthor: boolean;
  canManageQuestion: boolean;
  subscribed: boolean;
};

export function mapForumQuestionDetail(
  row: ForumQuestionRow & { answers: ForumAnswerRow[] },
  reputation: ForumReputationMap,
  ctx: QuestionDetailContext,
): ForumQuestionDetail {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    status: row.status as ForumQuestionStatus,
    rawMaterial: taxonomyOrNull(row.rawMaterial),
    questionType: taxonomyOrNull(row.questionType),
    views: row.views,
    answersCount: row.answersCount,
    acceptedAnswerId: row.acceptedAnswerId,
    author: reputation.get(row.authorId) ?? fallbackReputation(row.authorId),
    createdAt: row.createdAt.toISOString(),
    isAuthor: ctx.isAuthor,
    canManage: ctx.canManageQuestion,
    subscribed: ctx.subscribed,
    answers: row.answers.map((answer) =>
      mapForumAnswer(answer, reputation, {
        votedAnswerIds: ctx.votedAnswerIds,
        canManageAnswer: ctx.canManageAnswer,
      }),
    ),
  };
}

// Карточка для админского списка (модерация/засев) — имя автора, без репутации.
export function mapForumAdminQuestionItem(row: ForumQuestionRow & { authorName: string }): ForumAdminQuestionItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status as ForumQuestionStatus,
    rawMaterial: taxonomyOrNull(row.rawMaterial),
    questionType: taxonomyOrNull(row.questionType),
    answersCount: row.answersCount,
    views: row.views,
    authorName: row.authorName,
    createdAt: row.createdAt.toISOString(),
  };
}
