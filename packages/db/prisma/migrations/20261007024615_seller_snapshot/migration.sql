-- AlterTable
ALTER TABLE "SellerProfile" ADD COLUMN     "dealCriterion" TEXT,
ADD COLUMN     "dealTargetAmountMinor" INTEGER,
ADD COLUMN     "dealTargetCurrency" CHAR(3),
ADD COLUMN     "dealTargetMarginPercent" INTEGER,
ADD COLUMN     "huntCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "huntCategoriesOther" TEXT,
ADD COLUMN     "improvementGoal" TEXT,
ADD COLUMN     "resellerStage" TEXT,
ADD COLUMN     "snapshotCompletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "sourcingChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sourcingChannelsOther" TEXT;
