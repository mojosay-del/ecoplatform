-- Умный поиск документации: полнотекстовый поиск + устойчивость к опечаткам.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.documentation_search_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT replace(lower(public.unaccent('public.unaccent'::regdictionary, coalesce(input, ''))), 'ё', 'е')
$$;

CREATE OR REPLACE FUNCTION public.documentation_payload_text(input jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  WITH RECURSIVE walk(value) AS (
    SELECT coalesce(input, '{}'::jsonb)
    UNION ALL
    SELECT child.value
    FROM walk
    CROSS JOIN LATERAL (
      SELECT item.value
      FROM jsonb_each(CASE WHEN jsonb_typeof(walk.value) = 'object' THEN walk.value ELSE '{}'::jsonb END) AS item
      UNION ALL
      SELECT item.value
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(walk.value) = 'array' THEN walk.value ELSE '[]'::jsonb END) AS item
    ) child
  )
  SELECT coalesce(string_agg(value #>> '{}', ' '), '')
  FROM walk
  WHERE jsonb_typeof(value) = 'string'
$$;

CREATE INDEX "DocumentationArticle_search_tsv_idx"
ON "DocumentationArticle"
USING GIN ((
  setweight(to_tsvector('russian', public.documentation_search_text("title")), 'A') ||
  setweight(to_tsvector('russian', public.documentation_search_text(coalesce("subtitle", ''))), 'B')
))
WHERE "status" = 'published'::"ContentStatus"
  AND ("iconType" IS NULL OR "iconType" <> 'category');

CREATE INDEX "DocumentationArticle_title_trgm_idx"
ON "DocumentationArticle"
USING GIN (public.documentation_search_text("title") gin_trgm_ops)
WHERE "status" = 'published'::"ContentStatus"
  AND ("iconType" IS NULL OR "iconType" <> 'category');

CREATE INDEX "DocumentationArticle_subtitle_trgm_idx"
ON "DocumentationArticle"
USING GIN (public.documentation_search_text(coalesce("subtitle", '')) gin_trgm_ops)
WHERE "status" = 'published'::"ContentStatus"
  AND ("iconType" IS NULL OR "iconType" <> 'category');

CREATE INDEX "DocumentationBlock_payload_search_tsv_idx"
ON "DocumentationBlock"
USING GIN (to_tsvector('russian', public.documentation_search_text(public.documentation_payload_text("payload"))));

CREATE INDEX "DocumentationBlock_payload_trgm_idx"
ON "DocumentationBlock"
USING GIN (public.documentation_search_text(public.documentation_payload_text("payload")) gin_trgm_ops);

CREATE INDEX "FileAsset_originalName_search_tsv_idx"
ON "FileAsset"
USING GIN (to_tsvector('russian', public.documentation_search_text("originalName")));

CREATE INDEX "FileAsset_originalName_trgm_idx"
ON "FileAsset"
USING GIN (public.documentation_search_text("originalName") gin_trgm_ops);
