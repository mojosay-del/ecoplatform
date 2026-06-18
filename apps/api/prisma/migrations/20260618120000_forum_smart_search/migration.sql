-- Умный поиск форума: полнотекстовый поиск + устойчивость к опечаткам.
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.forum_search_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT replace(lower(public.unaccent('public.unaccent'::regdictionary, coalesce(input, ''))), 'ё', 'е')
$$;

CREATE INDEX "ForumQuestion_search_tsv_idx"
ON "ForumQuestion"
USING GIN ((
  setweight(to_tsvector('russian', public.forum_search_text("title")), 'A') ||
  setweight(to_tsvector('russian', public.forum_search_text("body")), 'B')
))
WHERE "status" <> 'hidden'::"ForumQuestionStatus";

CREATE INDEX "ForumQuestion_title_trgm_idx"
ON "ForumQuestion"
USING GIN (public.forum_search_text("title") gin_trgm_ops)
WHERE "status" <> 'hidden'::"ForumQuestionStatus";

CREATE INDEX "ForumQuestion_body_trgm_idx"
ON "ForumQuestion"
USING GIN (public.forum_search_text("body") gin_trgm_ops)
WHERE "status" <> 'hidden'::"ForumQuestionStatus";

CREATE INDEX "ForumAnswer_body_search_tsv_idx"
ON "ForumAnswer"
USING GIN (to_tsvector('russian', public.forum_search_text("body")))
WHERE "hidden" = false;

CREATE INDEX "ForumAnswer_body_trgm_idx"
ON "ForumAnswer"
USING GIN (public.forum_search_text("body") gin_trgm_ops)
WHERE "hidden" = false;
