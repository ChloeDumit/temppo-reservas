-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "collectedByStudio" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Studio" ADD COLUMN     "mpConnectedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MercadoPagoAccount" (
    "studioId" TEXT NOT NULL,
    "mpUserId" TEXT NOT NULL,
    "nickname" TEXT,
    "email" TEXT,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "liveMode" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MercadoPagoAccount_pkey" PRIMARY KEY ("studioId")
);

-- AddForeignKey
ALTER TABLE "MercadoPagoAccount" ADD CONSTRAINT "MercadoPagoAccount_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

