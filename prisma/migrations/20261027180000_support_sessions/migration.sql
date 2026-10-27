-- AlterEnum
ALTER TYPE "VerificationPurpose" ADD VALUE 'SUPPORT_ENTRY';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "supportById" TEXT;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_supportById_fkey" FOREIGN KEY ("supportById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
