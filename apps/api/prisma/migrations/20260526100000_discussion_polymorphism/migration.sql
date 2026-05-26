-- Волна 7.1: полиморфные обсуждения.
-- Комментарии больше не цепляются напрямую к NewsPost. Вместо этого каждая
-- ветка комментариев висит на отдельной строке Discussion с парой
-- (targetType, targetId). Сейчас целевой тип — только news_post; в будущем
-- добавятся lesson, knowledge_article, listing, forum_thread, solution_review.
--
-- Миграция данных:
--   1) Создаём enum + таблицу Discussion.
--   2) Добавляем nullable Comment.discussionId.
--   3) Для каждого NewsPost, на который ссылается хотя бы один Comment,
--      создаём Discussion и проставляем Comment.discussionId.
--   4) Делаем discussionId NOT NULL, добавляем FK + индексы.
--   5) Сносим старый Comment.newsPostId и FK на NewsPost.

-- CreateEnum
CREATE TYPE "DiscussionTargetType" AS ENUM ('news_post', 'lesson', 'knowledge_article', 'listing', 'forum_thread', 'solution_review');

-- CreateTable
CREATE TABLE "Discussion" (
    "id" TEXT NOT NULL,
    "targetType" "DiscussionTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Discussion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Discussion_targetType_targetId_key" ON "Discussion"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "Discussion_targetType_targetId_idx" ON "Discussion"("targetType", "targetId");

-- Шаг 2: nullable discussionId, чтобы можно было backfill'ить существующие
-- комментарии без нарушения NOT NULL.
ALTER TABLE "Comment" ADD COLUMN "discussionId" TEXT;

-- Шаг 3a: создаём по одной Discussion на каждый NewsPost, у которого есть
-- хотя бы один Comment. Подзапрос с DISTINCT гарантирует уникальность
-- targetId, чтобы не нарваться на Discussion_targetType_targetId_key.
INSERT INTO "Discussion" ("id", "targetType", "targetId", "isLocked", "createdAt", "updatedAt")
SELECT
  'd' || replace(gen_random_uuid()::text, '-', ''),
  'news_post'::"DiscussionTargetType",
  np_id,
  false,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT "newsPostId" AS np_id
  FROM "Comment"
  WHERE "newsPostId" IS NOT NULL
) AS distinct_news;

-- Шаг 3b: проставляем Comment.discussionId по уже созданным Discussion.
UPDATE "Comment" c
SET "discussionId" = d."id"
FROM "Discussion" d
WHERE d."targetType" = 'news_post' AND d."targetId" = c."newsPostId";

-- Шаг 4: данные на месте — можно ужесточить NOT NULL.
ALTER TABLE "Comment" ALTER COLUMN "discussionId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_newsPostId_fkey";

-- DropIndex
DROP INDEX "Comment_newsPostId_parentCommentId_status_createdAt_idx";

-- Шаг 5: убираем старую колонку newsPostId.
ALTER TABLE "Comment" DROP COLUMN "newsPostId";

-- CreateIndex
CREATE INDEX "Comment_discussionId_parentCommentId_status_createdAt_idx" ON "Comment"("discussionId", "parentCommentId", "status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_discussionId_fkey" FOREIGN KEY ("discussionId") REFERENCES "Discussion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
