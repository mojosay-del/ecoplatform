-- Волна 7.2: Address как первоклассная сущность.
-- Раньше адрес жил одной строкой в Company.legalAddress (опционально).
-- Теперь у компании может быть структурированный фактический адрес
-- (factualAddress) и структурированный юр. адрес (structuredLegalAddress).
--
-- Старое поле Company.legalAddress остаётся как «отображаемая строка» —
-- для совместимости с биллинг-views, которые показывают адрес одной
-- строкой. При миграции: если у компании в legalAddress есть значение,
-- создаём Address(formatted=legalAddress, source='legacy') и привязываем
-- к structuredLegalAddressId.

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Россия',
    "region" TEXT,
    "city" TEXT NOT NULL,
    "street" TEXT,
    "building" TEXT,
    "apartment" TEXT,
    "postcode" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "formatted" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "factualAddressId" TEXT,
ADD COLUMN "structuredLegalAddressId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_factualAddressId_key" ON "Company"("factualAddressId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_structuredLegalAddressId_key" ON "Company"("structuredLegalAddressId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_factualAddressId_fkey" FOREIGN KEY ("factualAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_structuredLegalAddressId_fkey" FOREIGN KEY ("structuredLegalAddressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill для существующих компаний с непустым legalAddress: построчно
-- создаём Address и привязываем к structuredLegalAddressId. Делаем в DO-блоке,
-- чтобы избежать неоднозначности при JOIN по formatted (две разные компании
-- могли указать одинаковый текст адреса).
DO $$
DECLARE
  rec RECORD;
  new_address_id TEXT;
BEGIN
  FOR rec IN
    SELECT id, "legalAddress" AS legal
    FROM "Company"
    WHERE "legalAddress" IS NOT NULL AND trim("legalAddress") <> ''
  LOOP
    new_address_id := 'a' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO "Address" ("id", "country", "city", "formatted", "source", "createdAt", "updatedAt")
    VALUES (
      new_address_id,
      'Россия',
      'Не указан',
      rec.legal,
      'legacy',
      NOW(),
      NOW()
    );
    UPDATE "Company" SET "structuredLegalAddressId" = new_address_id WHERE id = rec.id;
  END LOOP;
END $$;
