ALTER TABLE "ListingPosition" ADD COLUMN "packaging" TEXT;
ALTER TABLE "ListingPosition" ADD COLUMN "moistureCondition" TEXT;
ALTER TABLE "ListingPosition" ADD COLUMN "contaminationCondition" TEXT;

UPDATE "ListingPosition" AS lp
SET "packaging" = ml."packaging"
FROM "MarketplaceListing" AS ml
WHERE lp."listingId" = ml."id"
  AND ml."packaging" IS NOT NULL
  AND btrim(ml."packaging") <> '';

UPDATE "ListingPosition"
SET "moistureCondition" = CASE
  WHEN "moisturePct" <= 5 THEN 'dry'
  WHEN "moisturePct" <= 20 THEN 'slightly_wet'
  ELSE 'wet'
END
WHERE "moisturePct" IS NOT NULL;

UPDATE "ListingPosition"
SET "contaminationCondition" = CASE
  WHEN "contaminationPct" <= 0 THEN 'clean'
  WHEN "contaminationPct" <= 5 THEN 'may_have_inclusions'
  ELSE 'has_inclusions'
END
WHERE "contaminationPct" IS NOT NULL;
