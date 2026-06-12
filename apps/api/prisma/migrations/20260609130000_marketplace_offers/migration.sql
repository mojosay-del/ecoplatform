-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('active', 'withdrawn', 'accepted', 'declined');

-- CreateEnum
CREATE TYPE "PriceCondition" AS ENUM ('from_place', 'at_gate');

-- CreateEnum
CREATE TYPE "DealResult" AS ENUM ('agreed', 'not_agreed');

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerCompanyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'active',
    "priceCondition" "PriceCondition" NOT NULL,
    "city" TEXT,
    "contactPhone" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "decisionDeadline" TIMESTAMP(3),
    "dealResult" "DealResult",
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferPosition" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "listingPositionId" TEXT NOT NULL,
    "pricePerKg" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Offer_listingId_status_idx" ON "Offer"("listingId", "status");

-- CreateIndex
CREATE INDEX "Offer_buyerCompanyId_status_createdAt_idx" ON "Offer"("buyerCompanyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Offer_status_decisionDeadline_idx" ON "Offer"("status", "decisionDeadline");

-- CreateIndex
CREATE INDEX "OfferPosition_listingPositionId_idx" ON "OfferPosition"("listingPositionId");

-- CreateIndex
CREATE UNIQUE INDEX "OfferPosition_offerId_listingPositionId_key" ON "OfferPosition"("offerId", "listingPositionId");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_buyerCompanyId_fkey" FOREIGN KEY ("buyerCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferPosition" ADD CONSTRAINT "OfferPosition_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferPosition" ADD CONSTRAINT "OfferPosition_listingPositionId_fkey" FOREIGN KEY ("listingPositionId") REFERENCES "ListingPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
