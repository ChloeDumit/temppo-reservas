-- CreateTable
CREATE TABLE "StudioLogo" (
    "studioId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioLogo_pkey" PRIMARY KEY ("studioId")
);

-- AddForeignKey
ALTER TABLE "StudioLogo" ADD CONSTRAINT "StudioLogo_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
