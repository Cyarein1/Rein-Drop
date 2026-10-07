-- AlterTable
ALTER TABLE "Entitlement" ADD COLUMN     "value" TEXT;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "isFree" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "limitsFinal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;
