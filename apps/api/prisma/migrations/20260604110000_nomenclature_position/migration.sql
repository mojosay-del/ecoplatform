ALTER TABLE "Nomenclature" ADD COLUMN "position" INTEGER;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "categoryId"
      ORDER BY "name" ASC, "createdAt" ASC, "id" ASC
    ) - 1 AS "newPosition"
  FROM "Nomenclature"
)
UPDATE "Nomenclature"
SET "position" = ranked."newPosition"
FROM ranked
WHERE "Nomenclature"."id" = ranked."id";

ALTER TABLE "Nomenclature" ALTER COLUMN "position" SET NOT NULL;
ALTER TABLE "Nomenclature" ALTER COLUMN "position" SET DEFAULT 0;

CREATE INDEX "Nomenclature_categoryId_position_idx" ON "Nomenclature"("categoryId", "position");
