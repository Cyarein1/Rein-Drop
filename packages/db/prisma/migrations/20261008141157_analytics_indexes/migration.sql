-- CreateIndex
CREATE INDEX "HuntMatch_huntId_matchedAt_idx" ON "HuntMatch"("huntId", "matchedAt");

-- CreateIndex
CREATE INDEX "InventoryItem_userId_purchasedAt_idx" ON "InventoryItem"("userId", "purchasedAt");

