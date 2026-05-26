-- Волна 9.4: временная блокировка входа после серии неудачных попыток.
ALTER TABLE "User"
  ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedLoginWindowStartedAt" TIMESTAMP(3),
  ADD COLUMN "lockedUntil" TIMESTAMP(3);

CREATE INDEX "User_lockedUntil_idx" ON "User"("lockedUntil");
