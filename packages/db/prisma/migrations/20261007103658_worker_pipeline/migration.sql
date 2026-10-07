-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "SearchRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'DEAD');

-- AlterTable
ALTER TABLE "HuntMarketplace" ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastPollError" TEXT,
ADD COLUMN     "lastPollErrorCode" TEXT,
ADD COLUMN     "lastPollStatus" "PollStatus",
ADD COLUMN     "lastPolledAt" TIMESTAMPTZ(3),
ADD COLUMN     "nextPollAt" TIMESTAMPTZ(3);

-- AlterTable
-- Existing rows predate provider tracking: backfill 'unknown', then require it explicitly.
ALTER TABLE "RawListing" ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "searchRunId" UUID;
ALTER TABLE "RawListing" ALTER COLUMN "provider" DROP DEFAULT;

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" UUID NOT NULL,
    "jobId" TEXT NOT NULL,
    "marketplaceId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "huntIds" UUID[],
    "status" "SearchRunStatus" NOT NULL DEFAULT 'RUNNING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "newListingCount" INTEGER NOT NULL DEFAULT 0,
    "updatedListingCount" INTEGER NOT NULL DEFAULT 0,
    "unreadableCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" UUID NOT NULL,
    "queue" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockToken" UUID,
    "lockedUntil" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchRun_jobId_key" ON "SearchRun"("jobId");

-- CreateIndex
CREATE INDEX "SearchRun_marketplaceId_startedAt_idx" ON "SearchRun"("marketplaceId", "startedAt");

-- CreateIndex
CREATE INDEX "SearchRun_status_idx" ON "SearchRun"("status");

-- CreateIndex
CREATE INDEX "Job_queue_status_runAt_idx" ON "Job"("queue", "status", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_queue_dedupeKey_key" ON "Job"("queue", "dedupeKey");

-- CreateIndex
CREATE INDEX "HuntMarketplace_isEnabled_nextPollAt_idx" ON "HuntMarketplace"("isEnabled", "nextPollAt");

-- CreateIndex
CREATE UNIQUE INDEX "RawListing_searchRunId_marketplaceId_externalId_key" ON "RawListing"("searchRunId", "marketplaceId", "externalId");

-- AddForeignKey
ALTER TABLE "SearchRun" ADD CONSTRAINT "SearchRun_marketplaceId_fkey" FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawListing" ADD CONSTRAINT "RawListing_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

