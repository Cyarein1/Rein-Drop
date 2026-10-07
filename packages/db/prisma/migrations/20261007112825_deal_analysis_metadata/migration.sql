-- AlterTable
ALTER TABLE "DealAnalysis" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "inputHash" TEXT,
ADD COLUMN     "modelVersion" TEXT,
ADD COLUMN     "promptVersion" TEXT,
ADD COLUMN     "providerMetadata" JSONB,
ADD COLUMN     "schemaVersion" INTEGER;

-- CreateIndex
CREATE INDEX "DealAnalysis_inputHash_idx" ON "DealAnalysis"("inputHash");

