-- CreateIndex
CREATE INDEX "Comment_newsPostId_parentCommentId_status_createdAt_idx" ON "Comment"("newsPostId", "parentCommentId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Comment_parentCommentId_status_createdAt_idx" ON "Comment"("parentCommentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticle_parentId_status_position_idx" ON "KnowledgeBaseArticle"("parentId", "status", "position");

-- CreateIndex
CREATE INDEX "KnowledgeBaseArticle_status_position_idx" ON "KnowledgeBaseArticle"("status", "position");

-- CreateIndex
CREATE INDEX "LearningModule_status_position_idx" ON "LearningModule"("status", "position");

-- CreateIndex
CREATE INDEX "NewsPost_status_firstPublishedAt_idx" ON "NewsPost"("status", "firstPublishedAt" DESC);

-- CreateIndex
CREATE INDEX "NewsPost_updatedAt_idx" ON "NewsPost"("updatedAt" DESC);

-- CreateIndex
CREATE INDEX "PriceIndex_status_idx" ON "PriceIndex"("status");

-- CreateIndex
CREATE INDEX "Subscription_companyId_createdAt_idx" ON "Subscription"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Subscription_status_endsAt_idx" ON "Subscription"("status", "endsAt");

-- CreateIndex
CREATE INDEX "SupportTicket_companyId_updatedAt_idx" ON "SupportTicket"("companyId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "SupportTicketMessage_ticketId_createdAt_idx" ON "SupportTicketMessage"("ticketId", "createdAt");
