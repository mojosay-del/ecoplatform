import { ForumQuestionStatus, Prisma } from "@prisma/client";
import type { ForumSearchSnippet } from "@ecoplatform/shared";
import type { PrismaService } from "../prisma/prisma.service";

type ForumSearchInput = {
  q: string;
  rawMaterialId?: string;
  questionTypeId?: string;
  sort?: "newest" | "unanswered" | "popular";
  limit: number;
  offset: number;
};

export type ForumSearchMatch = {
  id: string;
  score: number;
  snippet: ForumSearchSnippet;
};

type ForumSearchRow = {
  id: string;
  score: number;
  snippetSource: string;
  snippetSourceType: ForumSearchSnippet["source"];
  total: number;
};

const SEARCH_SNIPPET_RADIUS_BEFORE = 80;
const SEARCH_SNIPPET_RADIUS_AFTER = 140;
const MIN_HIGHLIGHT_TOKEN_LENGTH = 2;
const TITLE_TYPO_THRESHOLD = 0.38;
const BODY_TYPO_THRESHOLD = 0.42;

export async function searchForumQuestions(
  prisma: PrismaService,
  input: ForumSearchInput,
): Promise<{ matches: ForumSearchMatch[]; total: number }> {
  const rawMaterialFilter = input.rawMaterialId
    ? Prisma.sql`AND q."rawMaterialId" = ${input.rawMaterialId}`
    : Prisma.empty;
  const questionTypeFilter = input.questionTypeId
    ? Prisma.sql`AND q."questionTypeId" = ${input.questionTypeId}`
    : Prisma.empty;
  const unansweredFilter = input.sort === "unanswered" ? Prisma.sql`AND q."answersCount" = 0` : Prisma.empty;
  const secondaryOrder =
    input.sort === "popular"
      ? Prisma.sql`q."views" DESC, q."answersCount" DESC, q."createdAt" DESC`
      : Prisma.sql`q."createdAt" DESC`;

  const rows = await prisma.$queryRaw<ForumSearchRow[]>(Prisma.sql`
    WITH search_input AS (
      SELECT
        public.forum_search_text(${input.q}) AS normalized_q,
        websearch_to_tsquery('russian', public.forum_search_text(${input.q})) AS tsq
    ),
    question_matches AS (
      SELECT
        q."id",
        CASE
          WHEN metrics.title_match OR metrics.title_similarity >= ${TITLE_TYPO_THRESHOLD} THEN q."title"
          ELSE q."body"
        END AS "snippetSource",
        CASE
          WHEN metrics.title_match OR metrics.title_similarity >= ${TITLE_TYPO_THRESHOLD} THEN 'title'
          ELSE 'question'
        END AS "snippetSourceType",
        (
          metrics.title_rank * 8
          + metrics.body_rank * 4
          + metrics.title_similarity * 1.4
          + metrics.body_similarity * 0.7
        )::double precision AS "score"
      FROM "ForumQuestion" q
      CROSS JOIN search_input s
      CROSS JOIN LATERAL (
        SELECT
          to_tsvector('russian', public.forum_search_text(q."title")) AS title_vector,
          to_tsvector('russian', public.forum_search_text(q."body")) AS body_vector,
          public.forum_search_text(q."title") AS title_norm,
          public.forum_search_text(q."body") AS body_norm
      ) doc
      CROSS JOIN LATERAL (
        SELECT
          s.tsq::text <> '' AND doc.title_vector @@ s.tsq AS title_match,
          s.tsq::text <> '' AND doc.body_vector @@ s.tsq AS body_match,
          CASE WHEN s.tsq::text <> '' THEN ts_rank_cd(doc.title_vector, s.tsq, 32) ELSE 0 END AS title_rank,
          CASE WHEN s.tsq::text <> '' THEN ts_rank_cd(doc.body_vector, s.tsq, 32) ELSE 0 END AS body_rank,
          greatest(similarity(doc.title_norm, s.normalized_q), word_similarity(s.normalized_q, doc.title_norm)) AS title_similarity,
          greatest(similarity(doc.body_norm, s.normalized_q), word_similarity(s.normalized_q, doc.body_norm)) AS body_similarity
      ) metrics
      WHERE q."status" <> ${ForumQuestionStatus.hidden}::"ForumQuestionStatus"
        ${rawMaterialFilter}
        ${questionTypeFilter}
        ${unansweredFilter}
        AND (
          metrics.title_match
          OR metrics.body_match
          OR metrics.title_similarity >= ${TITLE_TYPO_THRESHOLD}
          OR metrics.body_similarity >= ${BODY_TYPO_THRESHOLD}
        )
    ),
    answer_matches AS (
      SELECT
        q."id",
        a."body" AS "snippetSource",
        'answer' AS "snippetSourceType",
        (
          metrics.answer_rank * 2.5
          + metrics.answer_similarity * 0.9
          + CASE WHEN a."isAccepted" THEN 0.35 ELSE 0 END
          + least(a."votesCount", 12)::double precision * 0.02
        )::double precision AS "score"
      FROM "ForumAnswer" a
      JOIN "ForumQuestion" q ON q."id" = a."questionId"
      CROSS JOIN search_input s
      CROSS JOIN LATERAL (
        SELECT
          to_tsvector('russian', public.forum_search_text(a."body")) AS answer_vector,
          public.forum_search_text(a."body") AS answer_norm
      ) doc
      CROSS JOIN LATERAL (
        SELECT
          s.tsq::text <> '' AND doc.answer_vector @@ s.tsq AS answer_match,
          CASE WHEN s.tsq::text <> '' THEN ts_rank_cd(doc.answer_vector, s.tsq, 32) ELSE 0 END AS answer_rank,
          greatest(similarity(doc.answer_norm, s.normalized_q), word_similarity(s.normalized_q, doc.answer_norm)) AS answer_similarity
      ) metrics
      WHERE q."status" <> ${ForumQuestionStatus.hidden}::"ForumQuestionStatus"
        AND a."hidden" = false
        ${rawMaterialFilter}
        ${questionTypeFilter}
        ${unansweredFilter}
        AND (
          metrics.answer_match
          OR metrics.answer_similarity >= ${BODY_TYPO_THRESHOLD}
        )
    ),
    all_matches AS (
      SELECT * FROM question_matches
      UNION ALL
      SELECT * FROM answer_matches
    ),
    ranked AS (
      SELECT DISTINCT ON ("id")
        "id",
        "snippetSource",
        "snippetSourceType",
        "score"
      FROM all_matches
      WHERE "score" > 0
      ORDER BY "id", "score" DESC
    )
    SELECT
      ranked."id",
      ranked."score",
      ranked."snippetSource",
      ranked."snippetSourceType",
      count(*) OVER()::integer AS "total"
    FROM ranked
    JOIN "ForumQuestion" q ON q."id" = ranked."id"
    ORDER BY ranked."score" DESC, ${secondaryOrder}
    LIMIT ${input.limit}
    OFFSET ${input.offset}
  `);

  return {
    total: rows[0]?.total ?? 0,
    matches: rows.map((row) => ({
      id: row.id,
      score: row.score,
      snippet: buildForumSearchSnippet(row.snippetSource, input.q, row.snippetSourceType),
    })),
  };
}

function buildForumSearchSnippet(
  sourceText: string,
  query: string,
  source: ForumSearchSnippet["source"],
): ForumSearchSnippet {
  const cleanSource = sourceText.replace(/\s+/g, " ").trim();
  const highlights = findHighlights(cleanSource, query);

  if (highlights.length === 0) {
    return {
      source,
      text: clipText(cleanSource, 0, SEARCH_SNIPPET_RADIUS_BEFORE + SEARCH_SNIPPET_RADIUS_AFTER),
      highlights: [],
    };
  }

  const first = highlights[0]!;
  const start = Math.max(0, first.start - SEARCH_SNIPPET_RADIUS_BEFORE);
  const end = Math.min(cleanSource.length, first.end + SEARCH_SNIPPET_RADIUS_AFTER);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < cleanSource.length ? "…" : "";
  const text = `${prefix}${cleanSource.slice(start, end)}${suffix}`;

  return {
    source,
    text,
    highlights: highlights
      .filter((range) => range.end > start && range.start < end)
      .map((range) => ({
        start: Math.max(range.start, start) - start + prefix.length,
        end: Math.min(range.end, end) - start + prefix.length,
      })),
  };
}

function findHighlights(sourceText: string, query: string): Array<{ start: number; end: number }> {
  const normalizedText = normalizeForHighlight(sourceText);
  const tokens = Array.from(
    new Set(
      normalizeForHighlight(query)
        .match(/[\p{L}\p{N}]+/gu)
        ?.filter((token) => token.length >= MIN_HIGHLIGHT_TOKEN_LENGTH) ?? [],
    ),
  ).sort((left, right) => right.length - left.length);

  const ranges: Array<{ start: number; end: number }> = [];
  for (const token of tokens) {
    let index = normalizedText.indexOf(token);
    while (index !== -1) {
      const nextRange = { start: index, end: index + token.length };
      if (!ranges.some((range) => rangesOverlap(range, nextRange))) {
        ranges.push(nextRange);
      }
      index = normalizedText.indexOf(token, index + token.length);
    }
  }

  return ranges.sort((left, right) => left.start - right.start || left.end - right.end);
}

function rangesOverlap(left: { start: number; end: number }, right: { start: number; end: number }) {
  return left.start < right.end && right.start < left.end;
}

function normalizeForHighlight(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
}

function clipText(text: string, start: number, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const end = Math.min(text.length, start + maxLength);
  return `${text.slice(start, end).trimEnd()}…`;
}
