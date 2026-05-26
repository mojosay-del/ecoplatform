-- Волна 7.3: расширение Company под полный профиль.
-- Все поля опциональные — на регистрации ничего не меняется, заполняются
-- через /account → Компания (UI приедет в Волне 7.4).

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "about" TEXT,
ADD COLUMN "contactPersonEmail" TEXT,
ADD COLUMN "contactPersonName" TEXT,
ADD COLUMN "contactPersonPhone" TEXT,
ADD COLUMN "corporateEmail" TEXT,
ADD COLUMN "corporatePhone" TEXT,
ADD COLUMN "logoFileId" TEXT,
ADD COLUMN "websiteUrl" TEXT;
