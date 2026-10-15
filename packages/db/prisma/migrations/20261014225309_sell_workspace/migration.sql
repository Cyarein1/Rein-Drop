-- Sell workspace (decision 0019): sell listings, their photos and per-marketplace channels. Additive only.

-- CreateEnum
CREATE TYPE "SellListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ENDED');

-- CreateEnum
CREATE TYPE "ListingCondition" AS ENUM ('NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'FOR_PARTS');

-- CreateEnum
CREATE TYPE "SellPhotoSource" AS ENUM ('OWN', 'SOURCE');

-- CreateEnum
CREATE TYPE "SellChannelStatus" AS ENUM ('PUBLISHED', 'AWAITING_CONFIRMATION', 'FAILED', 'ENDED');

-- CreateTable
CREATE TABLE "SellListing" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "status" "SellListingStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "priceMinor" INTEGER,
    "currency" CHAR(3),
    "condition" "ListingCondition",
    "itemSpecifics" JSONB NOT NULL DEFAULT '[]',
    "aiAssisted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SellListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellPhoto" (
    "id" UUID NOT NULL,
    "sellListingId" UUID NOT NULL,
    "source" "SellPhotoSource" NOT NULL,
    "ref" TEXT NOT NULL,
    "contentType" TEXT,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellChannel" (
    "id" UUID NOT NULL,
    "sellListingId" UUID NOT NULL,
    "marketplace" TEXT NOT NULL,
    "status" "SellChannelStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "url" TEXT,
    "error" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SellChannel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SellListing_inventoryItemId_key" ON "SellListing"("inventoryItemId");

-- CreateIndex
CREATE INDEX "SellListing_userId_status_idx" ON "SellListing"("userId", "status");

-- CreateIndex
CREATE INDEX "SellPhoto_sellListingId_position_idx" ON "SellPhoto"("sellListingId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SellChannel_sellListingId_marketplace_key" ON "SellChannel"("sellListingId", "marketplace");

-- AddForeignKey
ALTER TABLE "SellListing" ADD CONSTRAINT "SellListing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellListing" ADD CONSTRAINT "SellListing_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellPhoto" ADD CONSTRAINT "SellPhoto_sellListingId_fkey" FOREIGN KEY ("sellListingId") REFERENCES "SellListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellChannel" ADD CONSTRAINT "SellChannel_sellListingId_fkey" FOREIGN KEY ("sellListingId") REFERENCES "SellListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
