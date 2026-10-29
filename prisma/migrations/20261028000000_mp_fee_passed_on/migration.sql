-- AlterTable
ALTER TABLE "Studio" ADD COLUMN     "mpFeePassedOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mpFeeBps" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "surchargeCents" INTEGER NOT NULL DEFAULT 0;
