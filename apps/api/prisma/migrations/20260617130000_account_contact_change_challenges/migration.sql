CREATE TYPE "AccountContactChangeField" AS ENUM ('email', 'phone');

CREATE TABLE "AccountContactChangeChallenge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "field" "AccountContactChangeField" NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "verifiedAt" TIMESTAMP(3),
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountContactChangeChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountContactChangeChallenge_userId_field_createdAt_idx"
  ON "AccountContactChangeChallenge"("userId", "field", "createdAt" DESC);

CREATE INDEX "AccountContactChangeChallenge_expiresAt_idx"
  ON "AccountContactChangeChallenge"("expiresAt");

ALTER TABLE "AccountContactChangeChallenge"
  ADD CONSTRAINT "AccountContactChangeChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
