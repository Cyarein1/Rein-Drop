-- Step 90 - item lifecycle without deleting (decision 0021): Cancelled items, Discarded listings,
-- the item event history (audit trail), manual "Add item" fields, closing data and channel ending.

-- CreateEnum
CREATE TYPE "InventoryEventType" AS ENUM ('BOUGHT', 'ADDED_MANUALLY', 'PURCHASE_EDITED', 'COSTS_EDITED', 'LISTED', 'UNLISTED', 'LISTING_STARTED', 'PUBLISHED', 'CHANNEL_ENDED', 'SOLD', 'SALE_CORRECTED', 'SALE_UNDONE', 'RETURNED', 'WRITTEN_OFF', 'CANCELLED', 'REOPENED', 'LISTING_DISCARDED', 'LISTING_RESTORED');

-- AlterEnum
ALTER TYPE "InventoryStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "SellListingStatus" ADD VALUE 'DISCARDED';

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "boughtFromMarketplace" TEXT,
ADD COLUMN     "boughtFromText" TEXT,
ADD COLUMN     "closedAt" TIMESTAMPTZ(3),
ADD COLUMN     "closedNote" TEXT,
ADD COLUMN     "refundMinor" INTEGER;

-- AlterTable
ALTER TABLE "SellChannel" ADD COLUMN     "endedAt" TIMESTAMPTZ(3),
ADD COLUMN     "endedReason" TEXT,
ADD COLUMN     "removalPending" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InventoryEvent" (
    "id" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "InventoryEventType" NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "details" JSONB,

    CONSTRAINT "InventoryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryEvent_inventoryItemId_at_idx" ON "InventoryEvent"("inventoryItemId", "at");

-- CreateIndex
CREATE INDEX "InventoryEvent_userId_at_idx" ON "InventoryEvent"("userId", "at");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_closedAt_idx" ON "InventoryItem"("userId", "closedAt");

-- AddForeignKey
ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryEvent" ADD CONSTRAINT "InventoryEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the timeline of existing items from the timestamps already stored (source "system",
-- details.backfilled = true). Only facts that are certain: bought / added, listing started,
-- published, ended, sold.
INSERT INTO "InventoryEvent" ("id", "inventoryItemId", "userId", "type", "at", "source", "details")
SELECT gen_random_uuid(), i."id", i."userId",
  (CASE WHEN i."huntMatchId" IS NOT NULL THEN 'BOUGHT' ELSE 'ADDED_MANUALLY' END)::"InventoryEventType",
  i."purchasedAt", 'system',
  jsonb_build_object('backfilled', true, 'price', jsonb_build_object('amountMinor', i."purchasePriceMinor", 'currency', i."currency"))
    || CASE WHEN i."huntMatchId" IS NOT NULL THEN jsonb_build_object('dealId', i."huntMatchId") ELSE '{}'::jsonb END
FROM "InventoryItem" i;

INSERT INTO "InventoryEvent" ("id", "inventoryItemId", "userId", "type", "at", "source", "details")
SELECT gen_random_uuid(), l."inventoryItemId", l."userId", 'LISTING_STARTED', l."createdAt", 'system',
  jsonb_build_object('backfilled', true, 'listingId', l."id")
FROM "SellListing" l;

INSERT INTO "InventoryEvent" ("id", "inventoryItemId", "userId", "type", "at", "source", "details")
SELECT gen_random_uuid(), l."inventoryItemId", l."userId", 'PUBLISHED', c."publishedAt", 'system',
  jsonb_build_object('backfilled', true, 'listingId', l."id", 'marketplace', c."marketplace", 'simulated', c."provider" = 'mock')
FROM "SellChannel" c JOIN "SellListing" l ON l."id" = c."sellListingId"
WHERE c."publishedAt" IS NOT NULL;

INSERT INTO "InventoryEvent" ("id", "inventoryItemId", "userId", "type", "at", "source", "details")
SELECT gen_random_uuid(), l."inventoryItemId", l."userId", 'CHANNEL_ENDED', c."updatedAt", 'system',
  jsonb_build_object('backfilled', true, 'listingId', l."id", 'marketplace', c."marketplace", 'reason', 'user')
FROM "SellChannel" c JOIN "SellListing" l ON l."id" = c."sellListingId"
WHERE c."status" = 'ENDED';

UPDATE "SellChannel" SET "endedAt" = "updatedAt", "endedReason" = 'user' WHERE "status" = 'ENDED';

INSERT INTO "InventoryEvent" ("id", "inventoryItemId", "userId", "type", "at", "source", "details")
SELECT gen_random_uuid(), s."inventoryItemId", s."userId", 'SOLD', s."soldAt", 'system',
  jsonb_build_object('backfilled', true, 'price', jsonb_build_object('amountMinor', s."salePriceMinor", 'currency', s."currency"))
    || CASE WHEN m."key" IS NOT NULL THEN jsonb_build_object('marketplace', m."key") ELSE '{}'::jsonb END
FROM "Sale" s LEFT JOIN "Marketplace" m ON m."id" = s."marketplaceId";
