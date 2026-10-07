-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'SIMULATED', 'SKIPPED', 'FAILED');

-- DropIndex
DROP INDEX "Alert_userId_status_createdAt_idx";

-- AlterTable
ALTER TABLE "Alert" DROP COLUMN "channel",
DROP COLUMN "errorMessage",
DROP COLUMN "sentAt",
DROP COLUMN "status",
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "dealAnalysisId" UUID,
ADD COLUMN     "dedupeKey" TEXT NOT NULL;

-- DropEnum
DROP TYPE "AlertStatus";

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" UUID NOT NULL,
    "alertId" UUID NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT,
    "reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ(3),

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "userId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId","category","channel")
);

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_createdAt_idx" ON "NotificationDelivery"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_alertId_channel_key" ON "NotificationDelivery"("alertId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_dedupeKey_key" ON "Alert"("dedupeKey");

-- CreateIndex
CREATE INDEX "Alert_userId_createdAt_idx" ON "Alert"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_userId_readAt_idx" ON "Alert"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_dealAnalysisId_fkey" FOREIGN KEY ("dealAnalysisId") REFERENCES "DealAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

