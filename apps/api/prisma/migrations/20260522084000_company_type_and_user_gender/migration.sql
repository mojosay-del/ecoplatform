-- CreateEnum
CREATE TYPE "CompanyType" AS ENUM ('collector', 'trader', 'processor');

-- CreateEnum
CREATE TYPE "UserGender" AS ENUM ('male', 'female');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "type" "CompanyType" NOT NULL DEFAULT 'collector';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "gender" "UserGender" NOT NULL DEFAULT 'male';
