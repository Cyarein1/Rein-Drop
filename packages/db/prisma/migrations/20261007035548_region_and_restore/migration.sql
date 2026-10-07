-- AlterEnum
ALTER TYPE "HuntEventType" ADD VALUE 'RESTORED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "countryCode" CHAR(2),
ADD COLUMN     "currency" CHAR(3),
ADD COLUMN     "distanceUnit" TEXT,
ADD COLUMN     "regionSource" TEXT;
