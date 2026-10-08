-- AlterEnum
ALTER TYPE "CostCategory" ADD VALUE 'TAX';

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "expected" JSONB;

