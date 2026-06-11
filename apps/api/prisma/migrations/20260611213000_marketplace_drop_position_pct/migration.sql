UPDATE "ListingPosition"
SET "moistureCondition" = CASE
  WHEN "moisturePct" <= 5 THEN 'dry'
  WHEN "moisturePct" <= 20 THEN 'slightly_wet'
  ELSE 'wet'
END
WHERE "moisturePct" IS NOT NULL
  AND ("moistureCondition" IS NULL OR btrim("moistureCondition") = '');

UPDATE "ListingPosition"
SET "contaminationCondition" = CASE
  WHEN "contaminationPct" <= 0 THEN 'clean'
  WHEN "contaminationPct" <= 5 THEN 'may_have_inclusions'
  ELSE 'has_inclusions'
END
WHERE "contaminationPct" IS NOT NULL
  AND ("contaminationCondition" IS NULL OR btrim("contaminationCondition") = '');

ALTER TABLE "ListingPosition" DROP COLUMN "moisturePct";
ALTER TABLE "ListingPosition" DROP COLUMN "contaminationPct";
