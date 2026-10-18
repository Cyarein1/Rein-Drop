-- Data repair (decision 0021): an item is always ONE unit, so once it is sold, returned, written off
-- or cancelled its listings must be over. Before step 90, marking an item sold left its marketplace
-- listings PUBLISHED. End them now, the same way the API does: channel ENDED with a reason (assisted
-- channels such as Facebook keep a "remove it yourself" flag), the listing ENDED (a cancelled item's
-- draft is DISCARDED), and a CHANNEL_ENDED event in the item's history.

INSERT INTO "InventoryEvent" ("id", "inventoryItemId", "userId", "type", "at", "source", "details")
SELECT gen_random_uuid(), l."inventoryItemId", l."userId", 'CHANNEL_ENDED', NOW(), 'system',
  jsonb_build_object(
    'repaired', true,
    'listingId', l."id",
    'marketplace', c."marketplace",
    'reason', CASE i."status"
      WHEN 'SOLD' THEN CASE WHEN m."key" = c."marketplace" THEN 'sold_here' ELSE 'sold_elsewhere' END
      WHEN 'RETURNED' THEN 'returned'
      WHEN 'WRITTEN_OFF' THEN 'written_off'
      ELSE 'user'
    END,
    'removeManually', c."provider" = 'assisted')
FROM "SellChannel" c
JOIN "SellListing" l ON l."id" = c."sellListingId"
JOIN "InventoryItem" i ON i."id" = l."inventoryItemId"
LEFT JOIN "Sale" s ON s."inventoryItemId" = i."id"
LEFT JOIN "Marketplace" m ON m."id" = s."marketplaceId"
WHERE c."status" IN ('PUBLISHED', 'AWAITING_CONFIRMATION')
  AND i."status" IN ('SOLD', 'RETURNED', 'WRITTEN_OFF', 'CANCELLED');

UPDATE "SellChannel" c
SET "status" = 'ENDED',
    "endedAt" = NOW(),
    "endedReason" = CASE i."status"
      WHEN 'SOLD' THEN CASE WHEN m."key" = c."marketplace" THEN 'sold_here' ELSE 'sold_elsewhere' END
      WHEN 'RETURNED' THEN 'returned'
      WHEN 'WRITTEN_OFF' THEN 'written_off'
      ELSE 'user'
    END,
    "removalPending" = (c."provider" = 'assisted'),
    "updatedAt" = NOW()
FROM "SellListing" l
JOIN "InventoryItem" i ON i."id" = l."inventoryItemId"
LEFT JOIN "Sale" s ON s."inventoryItemId" = i."id"
LEFT JOIN "Marketplace" m ON m."id" = s."marketplaceId"
WHERE l."id" = c."sellListingId"
  AND c."status" IN ('PUBLISHED', 'AWAITING_CONFIRMATION')
  AND i."status" IN ('SOLD', 'RETURNED', 'WRITTEN_OFF', 'CANCELLED');

UPDATE "SellListing" l
SET "status" = CASE WHEN i."status" = 'CANCELLED' AND l."status" = 'DRAFT' THEN 'DISCARDED'::"SellListingStatus" ELSE 'ENDED'::"SellListingStatus" END,
    "updatedAt" = NOW()
FROM "InventoryItem" i
WHERE i."id" = l."inventoryItemId"
  AND l."status" IN ('DRAFT', 'PUBLISHED')
  AND i."status" IN ('SOLD', 'RETURNED', 'WRITTEN_OFF', 'CANCELLED');
