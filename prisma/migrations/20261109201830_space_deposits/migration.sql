-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "depositType" "DepositType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "depositValue" INTEGER NOT NULL DEFAULT 0;
