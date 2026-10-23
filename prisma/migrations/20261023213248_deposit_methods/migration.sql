-- AlterTable
ALTER TABLE "Studio" ADD COLUMN     "acceptMercadoPago" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "acceptTransfer" BOOLEAN NOT NULL DEFAULT true;
