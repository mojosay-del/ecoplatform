-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "ListingPositionForm" AS ENUM ('pressed', 'loose');

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "sellerCompanyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'draft',
    "addressId" TEXT NOT NULL,
    "circleLat" DECIMAL(10,7),
    "circleLon" DECIMAL(10,7),
    "contactPhone" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "packaging" TEXT,
    "paymentTerms" TEXT,
    "readyNow" BOOLEAN NOT NULL DEFAULT true,
    "readinessDate" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingPosition" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "nomenclatureId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "weightKg" DECIMAL(12,2) NOT NULL,
    "form" "ListingPositionForm" NOT NULL DEFAULT 'loose',
    "moisturePct" DECIMAL(5,2),
    "contaminationPct" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingMedia" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingMedia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListing_addressId_key" ON "MarketplaceListing"("addressId");

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_publishedAt_idx" ON "MarketplaceListing"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "MarketplaceListing_sellerCompanyId_status_createdAt_idx" ON "MarketplaceListing"("sellerCompanyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MarketplaceListing_status_expiresAt_idx" ON "MarketplaceListing"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "ListingPosition_nomenclatureId_idx" ON "ListingPosition"("nomenclatureId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingPosition_listingId_position_key" ON "ListingPosition"("listingId", "position");

-- CreateIndex
CREATE INDEX "ListingMedia_fileId_idx" ON "ListingMedia"("fileId");

-- CreateIndex
CREATE UNIQUE INDEX "ListingMedia_listingId_position_key" ON "ListingMedia"("listingId", "position");

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_sellerCompanyId_fkey" FOREIGN KEY ("sellerCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPosition" ADD CONSTRAINT "ListingPosition_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPosition" ADD CONSTRAINT "ListingPosition_nomenclatureId_fkey" FOREIGN KEY ("nomenclatureId") REFERENCES "Nomenclature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingMedia" ADD CONSTRAINT "ListingMedia_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
