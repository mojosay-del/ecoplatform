CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdempotencyKey_key_endpoint_actorId_key" ON "IdempotencyKey"("key", "endpoint", "actorId");

CREATE INDEX "IdempotencyKey_endpoint_createdAt_idx" ON "IdempotencyKey"("endpoint", "createdAt");

CREATE INDEX "IdempotencyKey_actorId_createdAt_idx" ON "IdempotencyKey"("actorId", "createdAt");

CREATE INDEX "IdempotencyKey_referenceType_referenceId_idx" ON "IdempotencyKey"("referenceType", "referenceId");
