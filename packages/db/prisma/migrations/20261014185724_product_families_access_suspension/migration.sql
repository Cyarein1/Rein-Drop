-- Product families and account suspension (decision 0018). Additive only: existing plans become
-- SOURCE plans (the default), existing users are not suspended (NULL). No data is changed or removed.

-- CreateEnum
CREATE TYPE "ProductFamily" AS ENUM ('SOURCE', 'SELL', 'COMPLETE');

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "family" "ProductFamily" NOT NULL DEFAULT 'SOURCE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessSuspendedAt" TIMESTAMPTZ(3),
ADD COLUMN     "accessSuspendedReason" TEXT;

-- A suspension always says why (shown to support, never to other users).
ALTER TABLE "User" ADD CONSTRAINT "User_access_suspension_reason_check"
  CHECK ("accessSuspendedAt" IS NULL OR "accessSuspendedReason" IS NOT NULL);