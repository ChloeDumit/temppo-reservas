-- CreateEnum
CREATE TYPE "RentalStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "RentalSource" AS ENUM ('STAFF', 'ONLINE');

-- AlterEnum
ALTER TYPE "Vertical" ADD VALUE 'VENUES';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "rentalId" TEXT;

-- AlterTable
ALTER TABLE "TimeOff" ADD COLUMN     "spaceId" TEXT;

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "description" TEXT,
    "capacity" INTEGER,
    "priceCentsPerHour" INTEGER NOT NULL,
    "durationsMin" INTEGER[] DEFAULT ARRAY[60, 90]::INTEGER[],
    "bufferAfterMin" INTEGER NOT NULL DEFAULT 0,
    "colorHex" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceHours" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,

    CONSTRAINT "SpaceHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpacePriceBand" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "label" TEXT,
    "weekdays" INTEGER[],
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "priceCentsPerHour" INTEGER NOT NULL,

    CONSTRAINT "SpacePriceBand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rental" (
    "id" TEXT NOT NULL,
    "studioId" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "spaceName" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3) NOT NULL,
    "status" "RentalStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" "RentalSource" NOT NULL DEFAULT 'STAFF',
    "priceCents" INTEGER NOT NULL,
    "depositCents" INTEGER NOT NULL DEFAULT 0,
    "depositStatus" "DepositStatus" NOT NULL DEFAULT 'NONE',
    "holdExpiresAt" TIMESTAMP(3),
    "manageTokenHash" TEXT NOT NULL,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "remindersSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rental_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Space_studioId_isActive_idx" ON "Space"("studioId", "isActive");

-- CreateIndex
CREATE INDEX "SpaceHours_spaceId_weekday_idx" ON "SpaceHours"("spaceId", "weekday");

-- CreateIndex
CREATE INDEX "SpacePriceBand_spaceId_idx" ON "SpacePriceBand"("spaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Rental_manageTokenHash_key" ON "Rental"("manageTokenHash");

-- CreateIndex
CREATE INDEX "Rental_studioId_startsAt_idx" ON "Rental"("studioId", "startsAt");

-- CreateIndex
CREATE INDEX "Rental_spaceId_startsAt_idx" ON "Rental"("spaceId", "startsAt");

-- CreateIndex
CREATE INDEX "Rental_clientId_startsAt_idx" ON "Rental"("clientId", "startsAt");

-- CreateIndex
CREATE INDEX "Rental_status_holdExpiresAt_idx" ON "Rental"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "Payment_rentalId_idx" ON "Payment"("rentalId");

-- CreateIndex
CREATE INDEX "TimeOff_spaceId_startsAt_idx" ON "TimeOff"("spaceId", "startsAt");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_rentalId_fkey" FOREIGN KEY ("rentalId") REFERENCES "Rental"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Space" ADD CONSTRAINT "Space_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceHours" ADD CONSTRAINT "SpaceHours_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpacePriceBand" ADD CONSTRAINT "SpacePriceBand_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "StudentProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
