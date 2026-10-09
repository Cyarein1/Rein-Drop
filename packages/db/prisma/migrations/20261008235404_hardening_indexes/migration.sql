-- CreateIndex
CREATE INDEX "Alert_userId_id_idx" ON "Alert"("userId", "id");

-- CreateIndex
CREATE INDEX "Alert_huntId_createdAt_idx" ON "Alert"("huntId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_huntMatchId_idx" ON "Alert"("huntMatchId");

-- CreateIndex
CREATE INDEX "Alert_dealAnalysisId_idx" ON "Alert"("dealAnalysisId");

-- CreateIndex
CREATE INDEX "HuntMatch_firstSearchRunId_idx" ON "HuntMatch"("firstSearchRunId");

-- CreateIndex
CREATE INDEX "InventoryItem_listingId_idx" ON "InventoryItem"("listingId");

-- CreateIndex
CREATE INDEX "Sale_marketplaceId_idx" ON "Sale"("marketplaceId");

-- CreateIndex
CREATE INDEX "SavedDeal_huntMatchId_idx" ON "SavedDeal"("huntMatchId");

