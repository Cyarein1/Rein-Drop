-- Push receipts (step 84): tickets accepted by the push provider, checked later for delivery errors. Additive only.

-- CreateTable
CREATE TABLE "PushTicket" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "pushDeviceId" UUID NOT NULL,
    "deliveryId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedAt" TIMESTAMPTZ(3),
    "receiptStatus" TEXT,
    "receiptError" TEXT,

    CONSTRAINT "PushTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushTicket_ticketId_key" ON "PushTicket"("ticketId");

-- CreateIndex
CREATE INDEX "PushTicket_checkedAt_createdAt_idx" ON "PushTicket"("checkedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "PushTicket" ADD CONSTRAINT "PushTicket_pushDeviceId_fkey" FOREIGN KEY ("pushDeviceId") REFERENCES "PushDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushTicket" ADD CONSTRAINT "PushTicket_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "NotificationDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;
