-- AlterTable
ALTER TABLE "Studio" ADD COLUMN     "billingRemindedFor" TIMESTAMP(3),
ADD COLUMN     "billingReminderStage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "launchPriceUntil" TIMESTAMP(3),
ADD COLUMN     "nextPlan" "Plan",
ADD COLUMN     "waExtraCredits" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SubscriptionCharge" ADD COLUMN     "plan" "Plan",
ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'PLAN';

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);
