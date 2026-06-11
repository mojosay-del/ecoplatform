-- Убираем характеристики объявления, которые не должны задавать заготовители:
-- цвет/сорт и условия погрузки. Старую упаковку очищаем от значения "Тюки",
-- потому что тюки — это форма поставки позиции, а не упаковка.
UPDATE "MarketplaceListing"
SET "packaging" = NULLIF(
  (
    SELECT string_agg(cleaned.item, ', ' ORDER BY cleaned.ordinality)
    FROM (
      SELECT btrim(parts.value) AS item, parts.ordinality
      FROM unnest(string_to_array(COALESCE("MarketplaceListing"."packaging", ''), ',')) WITH ORDINALITY AS parts(value, ordinality)
      WHERE btrim(parts.value) <> '' AND btrim(parts.value) <> 'Тюки'
    ) AS cleaned
  ),
  ''
)
WHERE "packaging" IS NOT NULL;

ALTER TABLE "MarketplaceListing" DROP COLUMN "color";
ALTER TABLE "MarketplaceListing" DROP COLUMN "loadingConditions";
