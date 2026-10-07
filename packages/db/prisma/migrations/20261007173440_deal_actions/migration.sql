-- AlterEnum
ALTER TYPE "HuntMatchStatus" ADD VALUE 'BOUGHT';

-- AlterTable
ALTER TABLE "HuntMatch" ADD COLUMN     "boughtAt" TIMESTAMPTZ(3),
ADD COLUMN     "dismissReason" TEXT,
ADD COLUMN     "dismissedAt" TIMESTAMPTZ(3),
ADD COLUMN     "seenAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "huntMatchId" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_huntMatchId_key" ON "InventoryItem"("huntMatchId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_huntMatchId_fkey" FOREIGN KEY ("huntMatchId") REFERENCES "HuntMatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

