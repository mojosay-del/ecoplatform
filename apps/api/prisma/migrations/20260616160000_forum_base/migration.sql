-- CreateEnum
CREATE TYPE "ForumQuestionStatus" AS ENUM ('open', 'answered', 'solved', 'hidden');

-- AlterTable
ALTER TABLE "NewsPost" ADD COLUMN IF NOT EXISTS "pinnedInForum" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ForumRawMaterial" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumRawMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumQuestionType" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumQuestionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumQuestion" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorCompanyId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "rawMaterialId" TEXT,
    "questionTypeId" TEXT,
    "status" "ForumQuestionStatus" NOT NULL DEFAULT 'open',
    "views" INTEGER NOT NULL DEFAULT 0,
    "answersCount" INTEGER NOT NULL DEFAULT 0,
    "acceptedAnswerId" TEXT,
    "solvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumAnswer" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorCompanyId" TEXT,
    "body" TEXT NOT NULL,
    "votesCount" INTEGER NOT NULL DEFAULT 0,
    "isAccepted" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForumAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumAnswerVote" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumAnswerVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForumSubscription" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForumSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForumRawMaterial_label_key" ON "ForumRawMaterial"("label");

-- CreateIndex
CREATE INDEX "ForumRawMaterial_position_idx" ON "ForumRawMaterial"("position");

-- CreateIndex
CREATE UNIQUE INDEX "ForumQuestionType_label_key" ON "ForumQuestionType"("label");

-- CreateIndex
CREATE INDEX "ForumQuestionType_position_idx" ON "ForumQuestionType"("position");

-- CreateIndex
CREATE INDEX "ForumQuestion_status_createdAt_idx" ON "ForumQuestion"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ForumQuestion_rawMaterialId_idx" ON "ForumQuestion"("rawMaterialId");

-- CreateIndex
CREATE INDEX "ForumQuestion_questionTypeId_idx" ON "ForumQuestion"("questionTypeId");

-- CreateIndex
CREATE INDEX "ForumQuestion_authorId_idx" ON "ForumQuestion"("authorId");

-- CreateIndex
CREATE INDEX "ForumAnswer_questionId_votesCount_idx" ON "ForumAnswer"("questionId", "votesCount" DESC);

-- CreateIndex
CREATE INDEX "ForumAnswer_authorId_isAccepted_idx" ON "ForumAnswer"("authorId", "isAccepted");

-- CreateIndex
CREATE UNIQUE INDEX "ForumAnswerVote_answerId_userId_key" ON "ForumAnswerVote"("answerId", "userId");

-- CreateIndex
CREATE INDEX "ForumAnswerVote_userId_idx" ON "ForumAnswerVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ForumSubscription_questionId_userId_key" ON "ForumSubscription"("questionId", "userId");

-- CreateIndex
CREATE INDEX "ForumSubscription_userId_idx" ON "ForumSubscription"("userId");

-- CreateIndex
CREATE INDEX "NewsPost_status_pinnedInForum_idx" ON "NewsPost"("status", "pinnedInForum");

-- AddForeignKey
ALTER TABLE "ForumQuestion" ADD CONSTRAINT "ForumQuestion_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "ForumRawMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumQuestion" ADD CONSTRAINT "ForumQuestion_questionTypeId_fkey" FOREIGN KEY ("questionTypeId") REFERENCES "ForumQuestionType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumAnswer" ADD CONSTRAINT "ForumAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ForumQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumAnswerVote" ADD CONSTRAINT "ForumAnswerVote_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "ForumAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForumSubscription" ADD CONSTRAINT "ForumSubscription_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ForumQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed: справочник «Тип вопроса» по умолчанию (ТЗ §6). Админ может править/удалять.
-- «Вид сырья» НЕ сидируем — он наполняется админом с нуля (не связан с номенклатурой).
INSERT INTO "ForumQuestionType" ("id", "label", "position", "createdAt", "updatedAt") VALUES
  ('forumqtype0000000regulato', 'Регуляторика', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forumqtype0000000logistic', 'Логистика', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forumqtype0000000equipmnt', 'Оборудование', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forumqtype0000000pricemkt', 'Цены и рынок', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('forumqtype00000000000docs', 'Документы', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("label") DO NOTHING;
