-- CreateTable
CREATE TABLE "DocumentationArticle" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "iconType" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "firstPublishedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "fileAssetId" TEXT,
    "version" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "revisedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentationArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationBlock" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "DocumentationBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationArticle_slug_key" ON "DocumentationArticle"("slug");

-- CreateIndex
CREATE INDEX "DocumentationArticle_parentId_status_position_idx" ON "DocumentationArticle"("parentId", "status", "position");

-- CreateIndex
CREATE INDEX "DocumentationArticle_status_position_idx" ON "DocumentationArticle"("status", "position");

-- CreateIndex
CREATE INDEX "DocumentationArticle_status_isPinned_idx" ON "DocumentationArticle"("status", "isPinned");

-- CreateIndex
CREATE INDEX "DocumentationArticle_status_revisedAt_idx" ON "DocumentationArticle"("status", "revisedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationArticle_parentId_position_key" ON "DocumentationArticle"("parentId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationBlock_articleId_position_key" ON "DocumentationBlock"("articleId", "position");

-- AddForeignKey
ALTER TABLE "DocumentationArticle" ADD CONSTRAINT "DocumentationArticle_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DocumentationArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationArticle" ADD CONSTRAINT "DocumentationArticle_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationBlock" ADD CONSTRAINT "DocumentationBlock_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "DocumentationArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
