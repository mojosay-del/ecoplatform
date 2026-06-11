-- Предложение без хотя бы одной положительной цены не является валидным
-- предложением. Такие записи могли появиться в dev/ранних миграциях; скрываем
-- их из активного процесса сделки.
UPDATE "Offer" AS o
SET "status" = 'withdrawn',
    "resolvedAt" = COALESCE(o."resolvedAt", NOW())
WHERE o."status" IN ('active', 'accepted', 'declined')
  AND NOT EXISTS (
    SELECT 1
    FROM "OfferPosition" AS op
    WHERE op."offerId" = o."id"
      AND op."pricePerTonRub" IS NOT NULL
      AND op."pricePerTonRub" > 0
  );
