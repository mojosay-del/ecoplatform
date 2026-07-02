ALTER TABLE "MarketplaceListing"
ADD COLUMN "typicalLoadMinKg" DECIMAL(12,2),
ADD COLUMN "typicalLoadMaxKg" DECIMAL(12,2);

UPDATE "MarketplaceListing"
SET
  "typicalLoadMinKg" = "typicalLoadKg",
  "typicalLoadMaxKg" = "typicalLoadKg"
WHERE "typicalLoadKg" IS NOT NULL;
