-- CreateEnum
CREATE TYPE "ReviewDirection" AS ENUM ('buyer_to_seller', 'seller_to_buyer');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('published', 'hidden_by_moderator', 'removed_by_author');

-- CreateEnum
CREATE TYPE "ReviewCriterion" AS ENUM ('quality', 'weight_accuracy', 'shipping_speed', 'payment_speed', 'terms_adherence', 'reliability');

-- CreateTable
CREATE TABLE "MarketplaceReview" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "direction" "ReviewDirection" NOT NULL,
    "fromCompanyId" TEXT NOT NULL,
    "toCompanyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "comment" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'published',
    "editableUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceReviewScore" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "criterion" "ReviewCriterion" NOT NULL,
    "score" INTEGER NOT NULL,

    CONSTRAINT "MarketplaceReviewScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceReviewResponse" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceReviewResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMarketplaceRating" (
    "companyId" TEXT NOT NULL,
    "overall" DECIMAL(3,2) NOT NULL,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "byCriterion" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMarketplaceRating_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "MarketplaceReview_toCompanyId_status_createdAt_idx" ON "MarketplaceReview"("toCompanyId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MarketplaceReview_fromCompanyId_idx" ON "MarketplaceReview"("fromCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceReview_offerId_direction_key" ON "MarketplaceReview"("offerId", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceReviewScore_reviewId_criterion_key" ON "MarketplaceReviewScore"("reviewId", "criterion");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceReviewResponse_reviewId_key" ON "MarketplaceReviewResponse"("reviewId");

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_fromCompanyId_fkey" FOREIGN KEY ("fromCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReview" ADD CONSTRAINT "MarketplaceReview_toCompanyId_fkey" FOREIGN KEY ("toCompanyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReviewScore" ADD CONSTRAINT "MarketplaceReviewScore_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "MarketplaceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceReviewResponse" ADD CONSTRAINT "MarketplaceReviewResponse_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "MarketplaceReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMarketplaceRating" ADD CONSTRAINT "CompanyMarketplaceRating_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
