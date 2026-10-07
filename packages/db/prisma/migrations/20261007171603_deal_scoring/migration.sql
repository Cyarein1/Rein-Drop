-- AlterTable
ALTER TABLE "DealAnalysis" ADD COLUMN     "alertEligible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "alertKind" TEXT,
ADD COLUMN     "confidence" TEXT,
ADD COLUMN     "economics" JSONB,
ADD COLUMN     "score" INTEGER,
ADD COLUMN     "scoring" JSONB,
ADD COLUMN     "scoringVersion" INTEGER,
ADD COLUMN     "strength" TEXT;

-- CreateIndex
CREATE INDEX "DealAnalysis_alertEligible_createdAt_idx" ON "DealAnalysis"("alertEligible", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealAnalysis_huntMatchId_inputHash_key" ON "DealAnalysis"("huntMatchId", "inputHash");

