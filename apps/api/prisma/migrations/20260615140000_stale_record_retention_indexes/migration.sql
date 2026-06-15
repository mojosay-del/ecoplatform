-- Retention indexes for cleanup-stale-records.
CREATE INDEX "AdminActionLog_createdAt_idx" ON "AdminActionLog"("createdAt");

CREATE INDEX "InAppNotification_readAt_idx" ON "InAppNotification"("readAt");

CREATE INDEX "InAppNotification_archivedAt_idx" ON "InAppNotification"("archivedAt");
