-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "AdminActionLog_action_createdAt_idx" ON "AdminActionLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AdminActionLog_entityType_createdAt_idx" ON "AdminActionLog"("entityType", "createdAt");

-- CreateIndex
CREATE INDEX "AdminActionLog_actorId_createdAt_idx" ON "AdminActionLog"("actorId", "createdAt");
