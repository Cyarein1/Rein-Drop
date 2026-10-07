-- CreateEnum
CREATE TYPE "HuntPriority" AS ENUM ('NORMAL');

-- CreateEnum
CREATE TYPE "HuntEventType" AS ENUM ('CREATED', 'EDITED', 'ACTIVATED', 'PAUSED', 'RESUMED', 'ARCHIVED');

-- AlterEnum
BEGIN;
CREATE TYPE "HuntStatus_new" AS ENUM ('DRAFT', 'LIVE', 'PAUSED', 'ARCHIVED');
ALTER TABLE "public"."Hunt" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Hunt" ALTER COLUMN "status" TYPE "HuntStatus_new" USING ("status"::text::"HuntStatus_new");
ALTER TYPE "HuntStatus" RENAME TO "HuntStatus_old";
ALTER TYPE "HuntStatus_new" RENAME TO "HuntStatus";
DROP TYPE "public"."HuntStatus_old";
ALTER TABLE "Hunt" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- AlterTable
ALTER TABLE "Hunt" DROP COLUMN "criteria",
ADD COLUMN     "activatedAt" TIMESTAMPTZ(3),
ADD COLUMN     "archivedAt" TIMESTAMPTZ(3),
ADD COLUMN     "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "exclusions" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lastEditedAt" TIMESTAMPTZ(3),
ADD COLUMN     "locationText" TEXT,
ADD COLUMN     "maxPriceMinor" INTEGER,
ADD COLUMN     "pausedAt" TIMESTAMPTZ(3),
ADD COLUMN     "priceCurrency" CHAR(3),
ADD COLUMN     "priority" "HuntPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "radiusKm" INTEGER,
ADD COLUMN     "targetMarginPercent" INTEGER,
ADD COLUMN     "targetProfitMinor" INTEGER,
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "HuntMarketplace" ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL;

-- CreateTable
CREATE TABLE "HuntEvent" (
    "id" UUID NOT NULL,
    "huntId" UUID NOT NULL,
    "type" "HuntEventType" NOT NULL,
    "fromStatus" "HuntStatus",
    "toStatus" "HuntStatus",
    "changes" JSONB,
    "actorUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HuntEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HuntEvent_huntId_createdAt_idx" ON "HuntEvent"("huntId", "createdAt");

-- AddForeignKey
ALTER TABLE "HuntEvent" ADD CONSTRAINT "HuntEvent_huntId_fkey" FOREIGN KEY ("huntId") REFERENCES "Hunt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
