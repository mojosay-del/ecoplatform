-- Переводим публичный контракт предложений с ₽/кг на целые ₽/т.
-- Старые значения pricePerKg сохраняем как pricePerKg * 1000 с округлением до рубля.
ALTER TABLE "OfferPosition" ADD COLUMN "pricePerTonRub" INTEGER;

UPDATE "OfferPosition"
SET "pricePerTonRub" = ROUND("pricePerKg" * 1000)::INTEGER
WHERE "pricePerKg" IS NOT NULL;

ALTER TABLE "OfferPosition" DROP COLUMN "pricePerKg";
