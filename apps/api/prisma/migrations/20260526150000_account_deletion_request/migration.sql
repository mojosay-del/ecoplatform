-- Волна 9.6: пользователь может запросить удаление аккаунта.
-- Компания получает отдельный pending_deletion-статус, а прежний статус
-- сохраняется для кнопки «Передумал».
ALTER TYPE "CompanyStatus" ADD VALUE IF NOT EXISTS 'pending_deletion';

ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "statusBeforeDeletion" "CompanyStatus";

CREATE INDEX "User_deletionRequestedAt_idx" ON "User"("deletionRequestedAt");
