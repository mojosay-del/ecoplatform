ALTER TABLE "LearningModule" ADD COLUMN "position" INTEGER;

WITH ordered_modules AS (
  SELECT
    "id",
    row_number() OVER (ORDER BY "createdAt" ASC, "id" ASC) - 1 AS "nextPosition"
  FROM "LearningModule"
)
UPDATE "LearningModule"
SET "position" = ordered_modules."nextPosition"
FROM ordered_modules
WHERE "LearningModule"."id" = ordered_modules."id";

ALTER TABLE "LearningModule" ALTER COLUMN "position" SET NOT NULL;
ALTER TABLE "LearningModule" ALTER COLUMN "position" SET DEFAULT 0;
