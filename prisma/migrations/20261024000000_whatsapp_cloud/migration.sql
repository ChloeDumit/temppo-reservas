-- AlterTable
ALTER TABLE "NotificationLog" ADD COLUMN     "providerMessageId" TEXT;

-- CreateTable
CREATE TABLE "WhatsAppOptOut" (
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppOptOut_pkey" PRIMARY KEY ("phone")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_providerMessageId_key" ON "NotificationLog"("providerMessageId");

