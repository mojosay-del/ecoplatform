-- M-10: индексируемый статус перекодировки видео (зеркало JSON videoRenditions.status).

-- CreateEnum
CREATE TYPE "VideoTranscodeStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN "videoStatus" "VideoTranscodeStatus";

-- Backfill из существующего JSON-статуса, чтобы старые видео попали в выборку транскодера.
UPDATE "FileAsset"
SET "videoStatus" = ("videoRenditions"->>'status')::"VideoTranscodeStatus"
WHERE "videoRenditions" IS NOT NULL
  AND "videoRenditions"->>'status' IN ('pending', 'processing', 'ready', 'failed');

-- CreateIndex
CREATE INDEX "FileAsset_videoStatus_createdAt_idx" ON "FileAsset"("videoStatus", "createdAt");
