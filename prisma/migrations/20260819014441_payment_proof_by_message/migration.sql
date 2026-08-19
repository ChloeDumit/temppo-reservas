-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "shortCode" TEXT;

-- AlterTable
ALTER TABLE "Studio" ADD COLUMN     "whatsappNumber" TEXT;

-- CreateIndex
CREATE INDEX "Payment_studioId_shortCode_idx" ON "Payment"("studioId", "shortCode");
