-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "earnedMakeup" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "usedMakeup" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Studio" ADD COLUMN     "monthlyChangesAllowed" INTEGER NOT NULL DEFAULT 2;
