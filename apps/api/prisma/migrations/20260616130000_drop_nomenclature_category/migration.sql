-- Индексы цен переходят на единый плоский список номенклатур: концепция
-- категорий (Макулатура/Плёнки/Пластики) убрана и на пользовательском /indices,
-- и в админке. Дропаем связь Nomenclature → NomenclatureCategory и саму таблицу
-- категорий. Глобальный порядок номенклатур держится на Nomenclature.position.

-- DropForeignKey
ALTER TABLE "Nomenclature" DROP CONSTRAINT "Nomenclature_categoryId_fkey";

-- DropIndex
DROP INDEX "Nomenclature_categoryId_idx";
DROP INDEX "Nomenclature_categoryId_position_idx";

-- AlterTable
ALTER TABLE "Nomenclature" DROP COLUMN "categoryId";

-- DropTable
DROP TABLE "NomenclatureCategory";

-- CreateIndex
CREATE INDEX "Nomenclature_position_idx" ON "Nomenclature"("position");
