import { ContentStatus, Prisma } from "@prisma/client";
import type { DocumentationSearchSnippet } from "@ecoplatform/shared";
import { normalizeFileNameEncoding } from "../../files/file-name.helpers";
import type { PrismaService } from "../../prisma/prisma.service";

type DocumentationSearchInput = {
  q: string;
  limit: number;
};

export type DocumentationSearchMatch = {
  id: string;
  score: number;
  snippet: DocumentationSearchSnippet;
};

type DocumentationSearchRow = {
  id: string;
  score: number;
  snippetSource: string;
  snippetSourceType: DocumentationSearchSnippet["source"];
};

const SEARCH_SNIPPET_RADIUS_BEFORE = 70;
const SEARCH_SNIPPET_RADIUS_AFTER = 130;
const MIN_HIGHLIGHT_TOKEN_LENGTH = 2;
const TITLE_TYPO_THRESHOLD = 0.38;
const BODY_TYPO_THRESHOLD = 0.42;
const FILE_TYPO_THRESHOLD = 0.36;

export async function searchDocumentationArticles(
  prisma: PrismaService,
  input: DocumentationSearchInput,
): Promise<DocumentationSearchMatch[]> {
  const rows = await prisma.$queryRaw<DocumentationSearchRow[]>(Prisma.sql`
    WITH search_input AS (
      SELECT
        public.documentation_search_text(${input.q}) AS normalized_q,
        websearch_to_tsquery('russian', public.documentation_search_text(${input.q})) AS tsq
    ),
    docs AS (
      SELECT
        d."id",
        d."title",
        d."subtitle",
        d."revisedAt",
        f."originalName" AS "fileName"
      FROM "DocumentationArticle" d
      LEFT JOIN "FileAsset" f ON f."id" = d."fileAssetId"
      LEFT JOIN "DocumentationArticle" p ON p."id" = d."parentId"
      LEFT JOIN "DocumentationArticle" gp ON gp."id" = p."parentId"
      WHERE d."status" = ${ContentStatus.published}::"ContentStatus"
        AND (d."iconType" IS NULL OR d."iconType" <> 'category')
        AND (p."id" IS NULL OR p."status" = ${ContentStatus.published}::"ContentStatus")
        AND (gp."id" IS NULL OR gp."status" = ${ContentStatus.published}::"ContentStatus")
    ),
    metadata_matches AS (
      SELECT
        docs."id",
        CASE
          WHEN best.source = 'title' THEN docs."title"
          WHEN best.source = 'subtitle' THEN coalesce(docs."subtitle", '')
          ELSE coalesce(docs."fileName", '')
        END AS "snippetSource",
        best.source AS "snippetSourceType",
        best.score AS "score"
      FROM docs
      CROSS JOIN search_input s
      CROSS JOIN LATERAL (
        SELECT
          to_tsvector('russian', public.documentation_search_text(docs."title")) AS title_vector,
          to_tsvector('russian', public.documentation_search_text(coalesce(docs."subtitle", ''))) AS subtitle_vector,
          to_tsvector('russian', public.documentation_search_text(coalesce(docs."fileName", ''))) AS file_vector,
          public.documentation_search_text(docs."title") AS title_norm,
          public.documentation_search_text(coalesce(docs."subtitle", '')) AS subtitle_norm,
          public.documentation_search_text(coalesce(docs."fileName", '')) AS file_norm
      ) doc
      CROSS JOIN LATERAL (
        SELECT
          s.tsq::text <> '' AND doc.title_vector @@ s.tsq AS title_match,
          s.tsq::text <> '' AND doc.subtitle_vector @@ s.tsq AS subtitle_match,
          s.tsq::text <> '' AND doc.file_vector @@ s.tsq AS file_match,
          CASE WHEN s.tsq::text <> '' THEN ts_rank_cd(doc.title_vector, s.tsq, 32) ELSE 0 END AS title_rank,
          CASE WHEN s.tsq::text <> '' THEN ts_rank_cd(doc.subtitle_vector, s.tsq, 32) ELSE 0 END AS subtitle_rank,
          CASE WHEN s.tsq::text <> '' THEN ts_rank_cd(doc.file_vector, s.tsq, 32) ELSE 0 END AS file_rank,
          greatest(similarity(doc.title_norm, s.normalized_q), word_similarity(s.normalized_q, doc.title_norm)) AS title_similarity,
          greatest(similarity(doc.subtitle_norm, s.normalized_q), word_similarity(s.normalized_q, doc.subtitle_norm)) AS subtitle_similarity,
          greatest(similarity(doc.file_norm, s.normalized_q), word_similarity(s.normalized_q, doc.file_norm)) AS file_similarity
      ) metrics
      CROSS JOIN LATERAL (
        SELECT source, score
        FROM (
          VALUES
            ('title'::text, (metrics.title_rank * 8 + metrics.title_similarity * 1.4)::double precision),
            ('subtitle'::text, (metrics.subtitle_rank * 5 + metrics.subtitle_similarity * 1.0)::double precision),
            ('file'::text, (metrics.file_rank * 3 + metrics.file_similarity * 0.8)::double precision)
        ) AS candidate(source, score)
        ORDER BY score DESC
        LIMIT 1
      ) best
      WHERE
        metrics.title_match
        OR metrics.subtitle_match
        OR metrics.file_match
        OR metrics.title_similarity >= ${TITLE_TYPO_THRESHOLD}
        OR metrics.subtitle_similarity >= ${BODY_TYPO_THRESHOLD}
        OR metrics.file_similarity >= ${FILE_TYPO_THRESHOLD}
    ),
    block_matches AS (
      SELECT
        docs."id",
        public.documentation_payload_text(b."payload") AS "snippetSource",
        'description'::text AS "snippetSourceType",
        (
          metrics.block_rank * 3.8
          + metrics.block_similarity * 0.95
        )::double precision AS "score"
      FROM docs
      JOIN "DocumentationBlock" b ON b."articleId" = docs."id"
      CROSS JOIN search_input s
      CROSS JOIN LATERAL (
        SELECT
          to_tsvector('russian', public.documentation_search_text(public.documentation_payload_text(b."payload"))) AS block_vector,
          public.documentation_search_text(public.documentation_payload_text(b."payload")) AS block_norm
      ) doc
      CROSS JOIN LATERAL (
        SELECT
          s.tsq::text <> '' AND doc.block_vector @@ s.tsq AS block_match,
          CASE WHEN s.tsq::text <> '' THEN ts_rank_cd(doc.block_vector, s.tsq, 32) ELSE 0 END AS block_rank,
          greatest(similarity(doc.block_norm, s.normalized_q), word_similarity(s.normalized_q, doc.block_norm)) AS block_similarity
      ) metrics
      WHERE
        metrics.block_match
        OR metrics.block_similarity >= ${BODY_TYPO_THRESHOLD}
    ),
    all_matches AS (
      SELECT * FROM metadata_matches
      UNION ALL
      SELECT * FROM block_matches
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
      ranked."snippetSourceType"
    FROM ranked
    JOIN "DocumentationArticle" d ON d."id" = ranked."id"
    ORDER BY ranked."score" DESC, d."revisedAt" DESC NULLS LAST, d."title" ASC
    LIMIT ${input.limit}
  `);

  return rows.map((row) => ({
    id: row.id,
    score: row.score,
    snippet: buildDocumentationSearchSnippet(row.snippetSource, input.q, row.snippetSourceType),
  }));
}

function buildDocumentationSearchSnippet(
  sourceText: string,
  query: string,
  source: DocumentationSearchSnippet["source"],
): DocumentationSearchSnippet {
  const cleanSource = stripSearchSource(source === "file" ? normalizeFileNameEncoding(sourceText) : sourceText);
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
  const prefix = start > 0 ? "..." : "";
  const suffix = end < cleanSource.length ? "..." : "";
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

function stripSearchSource(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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
  return `${text.slice(start, end).trimEnd()}...`;
}
