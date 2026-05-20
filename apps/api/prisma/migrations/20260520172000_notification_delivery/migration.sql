-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'sms');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('queued', 'in_progress', 'delivered', 'failed', 'retry_scheduled', 'dead_lettered', 'no_recipients');

-- AlterTable
ALTER TABLE "InAppNotification"
ADD COLUMN     "deliveryId" TEXT,
ADD COLUMN     "domainEventId" TEXT,
ADD COLUMN     "eventType" TEXT,
ADD COLUMN     "sourceId" TEXT;

UPDATE "InAppNotification"
SET
  "domainEventId" = 'legacy.in_app:' || "id",
  "eventType" = 'legacy.in_app'
WHERE "domainEventId" IS NULL OR "eventType" IS NULL;

ALTER TABLE "InAppNotification"
ALTER COLUMN "domainEventId" SET NOT NULL,
ALTER COLUMN "eventType" SET NOT NULL;

-- AlterTable
ALTER TABLE "UserNotificationPreferences"
RENAME COLUMN "mutedCategories" TO "inAppMutedCategories";

ALTER TABLE "UserNotificationPreferences"
ADD COLUMN     "emailMutedCategories" "NotificationCategory"[];

UPDATE "UserNotificationPreferences"
SET
  "inAppMutedCategories" = COALESCE("inAppMutedCategories", ARRAY[]::"NotificationCategory"[]),
  "emailMutedCategories" = COALESCE("emailMutedCategories", ARRAY[]::"NotificationCategory"[]);

ALTER TABLE "UserNotificationPreferences"
ALTER COLUMN "inAppMutedCategories" SET DEFAULT ARRAY[]::"NotificationCategory"[],
ALTER COLUMN "inAppMutedCategories" SET NOT NULL,
ALTER COLUMN "emailMutedCategories" SET DEFAULT ARRAY[]::"NotificationCategory"[],
ALTER COLUMN "emailMutedCategories" SET NOT NULL;

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "domainEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "address" TEXT,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'queued',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "providerErrorCode" TEXT,
    "providerErrorText" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InAppNotification_deliveryId_key" ON "InAppNotification"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "InAppNotification_domainEventId_userId_key" ON "InAppNotification"("domainEventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_domainEventId_recipientUserId_channel_key" ON "NotificationDelivery"("domainEventId", "recipientUserId", "channel");

-- CreateIndex
CREATE INDEX "NotificationDelivery_recipientUserId_createdAt_idx" ON "NotificationDelivery"("recipientUserId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "NotificationDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
