-- Индексируемый поиск новостей.
-- Публичная лента (listPublishedNews) и админ-таблица (listAdminNews) фильтруют
-- по `title/lead ILIKE '%q%'` (Prisma: contains + mode:insensitive), а поиск по
-- тегам — по `NewsTag.name ILIKE '%q%'`. B-tree такой предикат с ведущим `%` не
-- покрывает → seq scan. При десятках новостей это незаметно, при сотнях —
-- полный проход таблицы на каждый запрос.
--
-- pg_trgm + GIN с классом gin_trgm_ops умеет обслуживать LIKE/ILIKE с любыми
-- шаблонами, поэтому существующие Prisma-запросы начинают опираться на индекс
-- БЕЗ переписывания (в отличие от forum_search_text: там индекс по функции и
-- запрос тоже вызывает функцию). Образец подхода — миграция
-- 20260618120000_forum_smart_search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "NewsPost_title_trgm_idx"
  ON "NewsPost" USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "NewsPost_lead_trgm_idx"
  ON "NewsPost" USING GIN ("lead" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "NewsTag_name_trgm_idx"
  ON "NewsTag" USING GIN ("name" gin_trgm_ops);
