-- M-9: вторая сторона смены контакта — подтверждение владения НОВЫМ адресом.
-- Аддитивно: nullable-поля нового значения/хэша кода + счётчик попыток (default 0).

-- AlterTable
ALTER TABLE "AccountContactChangeChallenge"
  ADD COLUMN "pendingValue" TEXT,
  ADD COLUMN "pendingCodeHash" TEXT,
  ADD COLUMN "pendingAttempts" INTEGER NOT NULL DEFAULT 0;
