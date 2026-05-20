-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'blocked');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SanctionType" ADD VALUE 'module_restriction';
ALTER TYPE "SanctionType" ADD VALUE 'user_block';
ALTER TYPE "SanctionType" ADD VALUE 'company_block';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'active';

-- CreateTable
CREATE TABLE "UserModuleRestriction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT,
    "moduleCode" TEXT NOT NULL,
    "sanctionId" TEXT,
    "reasonCode" TEXT NOT NULL,
    "comment" TEXT,
    "appliedById" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,

    CONSTRAINT "UserModuleRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserModuleRestriction_userId_moduleCode_liftedAt_expiresAt_idx" ON "UserModuleRestriction"("userId", "moduleCode", "liftedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "UserModuleRestriction_companyId_moduleCode_idx" ON "UserModuleRestriction"("companyId", "moduleCode");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- AddForeignKey
ALTER TABLE "UserModuleRestriction" ADD CONSTRAINT "UserModuleRestriction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModuleRestriction" ADD CONSTRAINT "UserModuleRestriction_sanctionId_fkey" FOREIGN KEY ("sanctionId") REFERENCES "Sanction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
