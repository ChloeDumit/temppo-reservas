-- AlterTable
ALTER TABLE "User" ADD COLUMN     "photoUrl" TEXT;

-- CreateTable
CREATE TABLE "StaffPhoto" (
    "userId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffPhoto_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "StaffPhoto" ADD CONSTRAINT "StaffPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
