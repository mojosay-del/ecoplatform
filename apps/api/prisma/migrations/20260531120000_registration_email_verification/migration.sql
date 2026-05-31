-- CreateTable
CREATE TABLE "EmailVerificationChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "organizationName" TEXT NOT NULL,
    "companyType" "CompanyType" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "gender" "UserGender" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "acceptedDocumentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailVerificationChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailVerificationChallenge_email_createdAt_idx" ON "EmailVerificationChallenge"("email", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EmailVerificationChallenge_phone_createdAt_idx" ON "EmailVerificationChallenge"("phone", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EmailVerificationChallenge_expiresAt_idx" ON "EmailVerificationChallenge"("expiresAt");
