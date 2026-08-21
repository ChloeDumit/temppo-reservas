-- An older student may have no email at all, so it stops being required and
-- a national ID (cédula) becomes an alternative sign-in handle.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN "documentId" TEXT,
                  ADD COLUMN "pinHash" TEXT;

-- Scoped like email: the same person may train at more than one studio.
-- Postgres allows repeated NULLs here, so accounts without a document are fine.
CREATE UNIQUE INDEX "User_studioId_documentId_key" ON "User"("studioId", "documentId");

CREATE INDEX "User_documentId_idx" ON "User"("documentId");

-- The claim window was tuned for a flow that needed a second login round-trip.
-- New studios get room to actually use the offer.
ALTER TABLE "Studio" ALTER COLUMN "waitlistClaimWindowMins" SET DEFAULT 120;
