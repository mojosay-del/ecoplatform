-- CreateEnum
CREATE TYPE "ModerationCaseType" AS ENUM ('complaint', 'suspicious_activity');

-- CreateEnum
CREATE TYPE "ModerationCaseStatus" AS ENUM ('open', 'in_review', 'resolved', 'escalated', 'closed_by_admin');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('pending', 'resolved', 'auto_closed');

-- CreateEnum
CREATE TYPE "ModerationDecisionType" AS ENUM ('leave_as_is', 'remove_content', 'warn_company', 'escalate_to_admin');

-- CreateEnum
CREATE TYPE "SanctionType" AS ENUM ('warning', 'content_removal');

-- CreateTable
CREATE TABLE "ModerationCase" (
    "id" TEXT NOT NULL,
    "type" "ModerationCaseType" NOT NULL DEFAULT 'complaint',
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityAuthorId" TEXT,
    "entityCompanyId" TEXT,
    "status" "ModerationCaseStatus" NOT NULL DEFAULT 'open',
    "lockedById" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ModerationCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Complaint" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorCompanyId" TEXT,
    "reasonCode" TEXT NOT NULL,
    "comment" TEXT,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Complaint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationDecision" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "type" "ModerationDecisionType" NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sanction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "decisionId" TEXT,
    "type" "SanctionType" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "parameters" JSONB,
    "appliedById" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,

    CONSTRAINT "Sanction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationCase_status_createdAt_idx" ON "ModerationCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ModerationCase_entityType_entityId_status_idx" ON "ModerationCase"("entityType", "entityId", "status");

-- CreateIndex
CREATE INDEX "ModerationCase_lockedById_lockedUntil_idx" ON "ModerationCase"("lockedById", "lockedUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Complaint_entityType_entityId_authorId_reasonCode_key" ON "Complaint"("entityType", "entityId", "authorId", "reasonCode");

-- CreateIndex
CREATE INDEX "Complaint_caseId_status_idx" ON "Complaint"("caseId", "status");

-- CreateIndex
CREATE INDEX "ModerationDecision_caseId_createdAt_idx" ON "ModerationDecision"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "Sanction_targetType_targetId_appliedAt_idx" ON "Sanction"("targetType", "targetId", "appliedAt");

-- CreateIndex
CREATE INDEX "Sanction_caseId_type_idx" ON "Sanction"("caseId", "type");

-- AddForeignKey
ALTER TABLE "Complaint" ADD CONSTRAINT "Complaint_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationDecision" ADD CONSTRAINT "ModerationDecision_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sanction" ADD CONSTRAINT "Sanction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "ModerationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sanction" ADD CONSTRAINT "Sanction_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "ModerationDecision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
