-- AlterTable
ALTER TABLE "ForumAnswer" ADD COLUMN "parentAnswerId" TEXT;

-- CreateIndex
CREATE INDEX "ForumAnswer_questionId_parentAnswerId_hidden_createdAt_idx" ON "ForumAnswer"("questionId", "parentAnswerId", "hidden", "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ForumAnswer_parentAnswerId_idx" ON "ForumAnswer"("parentAnswerId");

-- AddForeignKey
ALTER TABLE "ForumAnswer" ADD CONSTRAINT "ForumAnswer_parentAnswerId_fkey" FOREIGN KEY ("parentAnswerId") REFERENCES "ForumAnswer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
