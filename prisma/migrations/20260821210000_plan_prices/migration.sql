-- AlterTable
ALTER TABLE "SubscriptionCharge" ADD COLUMN     "months" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "PlanPrice" (
    "plan" "Plan" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("plan")
);
