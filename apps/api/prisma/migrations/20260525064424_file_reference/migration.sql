-- CreateTable
CREATE TABLE "FileReference" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FileReference_fileId_idx" ON "FileReference"("fileId");

-- CreateIndex
CREATE INDEX "FileReference_entityType_entityId_idx" ON "FileReference"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "FileReference_fileId_entityType_entityId_key" ON "FileReference"("fileId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "FileReference" ADD CONSTRAINT "FileReference_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "FileAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
