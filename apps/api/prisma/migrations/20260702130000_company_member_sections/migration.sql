-- Сотрудники компании: разрешённые разделы для member-пользователей и для
-- pending-приглашений (переносятся в User при принятии).
ALTER TABLE "User" ADD COLUMN "allowedSections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CompanyInvitation" ADD COLUMN "allowedSections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
