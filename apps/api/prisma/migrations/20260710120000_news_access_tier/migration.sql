-- CreateEnum
CREATE TYPE "NewsAccessTier" AS ENUM ('basic', 'extended');

-- AlterTable
ALTER TABLE "NewsPost"
ADD COLUMN "accessTier" "NewsAccessTier" NOT NULL DEFAULT 'basic';

-- CreateIndex
CREATE INDEX "NewsPost_status_accessTier_firstPublishedAt_idx"
ON "NewsPost"("status", "accessTier", "firstPublishedAt" DESC);
