-- CreateEnum
CREATE TYPE "SourceHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN', 'NOT_CONFIGURED');

-- AlterEnum
ALTER TYPE "PollStatus" ADD VALUE 'DEGRADED';

-- CreateTable
CREATE TABLE "MarketplaceHealth" (
    "marketplaceId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "SourceHealthStatus" NOT NULL,
    "reason" TEXT,
    "message" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastLatencyMs" INTEGER,
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastFailureAt" TIMESTAMPTZ(3),
    "statusSince" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retryAfter" TIMESTAMPTZ(3),
    "checkedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MarketplaceHealth_pkey" PRIMARY KEY ("marketplaceId")
);

-- AddForeignKey
ALTER TABLE "MarketplaceHealth" ADD CONSTRAINT "MarketplaceHealth_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

