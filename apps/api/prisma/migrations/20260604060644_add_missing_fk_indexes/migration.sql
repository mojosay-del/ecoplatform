-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "CommentLike_commentId_idx" ON "CommentLike"("commentId");

-- CreateIndex
CREATE INDEX "LessonProgress_lessonId_idx" ON "LessonProgress"("lessonId");

-- CreateIndex
CREATE INDEX "NewsLike_newsPostId_idx" ON "NewsLike"("newsPostId");

-- CreateIndex
CREATE INDEX "NewsPostTag_newsTagId_idx" ON "NewsPostTag"("newsTagId");

-- CreateIndex
CREATE INDEX "Nomenclature_categoryId_idx" ON "Nomenclature"("categoryId");

-- CreateIndex
CREATE INDEX "Payment_paymentMethodId_idx" ON "Payment"("paymentMethodId");

-- CreateIndex
CREATE INDEX "Sanction_decisionId_idx" ON "Sanction"("decisionId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "SupportTicket_authorId_idx" ON "SupportTicket"("authorId");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "User"("companyId");

-- CreateIndex
CREATE INDEX "UserModuleRestriction_sanctionId_idx" ON "UserModuleRestriction"("sanctionId");
