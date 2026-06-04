-- CreateEnum
CREATE TYPE "CompanyRole" AS ENUM ('owner', 'member');

-- CreateEnum
CREATE TYPE "CompanyInvitationStatus" AS ENUM ('pending', 'accepted', 'revoked', 'expired');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "seatsPurchased" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "seats" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "companyRole" "CompanyRole" NOT NULL DEFAULT 'member';

-- Backfill: существующий единственный пользователь каждой компании — владелец.
-- Регистрация всегда создавала пару «компания + один пользователь», поэтому
-- для каждой компании владельцем назначаем самого раннего по createdAt
-- пользователя (с тай-брейком по id). Остальные (если вдруг есть) остаются
-- member по дефолту колонки. Пользователей без компании не трогаем.
UPDATE "User" u
SET "companyRole" = 'owner'
WHERE u."companyId" IS NOT NULL
  AND u."id" = (
    SELECT u2."id"
    FROM "User" u2
    WHERE u2."companyId" = u."companyId"
    ORDER BY u2."createdAt" ASC, u2."id" ASC
    LIMIT 1
  );

-- CreateTable
CREATE TABLE "CompanyInvitation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "role" "CompanyRole" NOT NULL DEFAULT 'member',
    "status" "CompanyInvitationStatus" NOT NULL DEFAULT 'pending',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyInvitation_tokenHash_key" ON "CompanyInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "CompanyInvitation_companyId_status_idx" ON "CompanyInvitation"("companyId", "status");

-- CreateIndex
CREATE INDEX "CompanyInvitation_email_status_idx" ON "CompanyInvitation"("email", "status");

-- CreateIndex
CREATE INDEX "CompanyInvitation_expiresAt_idx" ON "CompanyInvitation"("expiresAt");

-- AddForeignKey
ALTER TABLE "CompanyInvitation" ADD CONSTRAINT "CompanyInvitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
