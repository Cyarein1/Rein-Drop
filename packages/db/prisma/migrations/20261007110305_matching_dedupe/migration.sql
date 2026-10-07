-- AlterEnum
ALTER TYPE "HuntMatchStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "HuntMatch" ADD COLUMN     "economics" JSONB,
ADD COLUMN     "firstSearchRunId" UUID,
ADD COLUMN     "lastEvaluatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "matcherVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "reasons" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "relevanceScore" INTEGER,
ADD COLUMN     "statusReason" TEXT;

-- AlterTable
ALTER TABLE "Listing" ADD COLUMN     "dedupeKey" TEXT,
ADD COLUMN     "duplicateOfId" UUID;

-- AlterTable
ALTER TABLE "SearchRun" ADD COLUMN     "duplicateCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "matchedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "newMatchCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rejectedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rejectionSummary" JSONB;

-- CreateIndex
CREATE INDEX "Listing_dedupeKey_idx" ON "Listing"("dedupeKey");

-- CreateIndex
CREATE INDEX "Listing_duplicateOfId_idx" ON "Listing"("duplicateOfId");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HuntMatch" ADD CONSTRAINT "HuntMatch_firstSearchRunId_fkey" FOREIGN KEY ("firstSearchRunId") REFERENCES "SearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

