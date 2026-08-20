-- Identity becomes per-studio: the same person can train at several studios,
-- so an email is unique within a studio rather than across the whole platform.
DROP INDEX "User_email_key";

CREATE UNIQUE INDEX "User_studioId_email_key" ON "User"("studioId", "email");

-- Login resolves an email across studios, so it needs its own index now that
-- the unique one is composite and no longer serves an email-only lookup.
CREATE INDEX "User_email_idx" ON "User"("email");

-- Short-lived "which studio did you mean?" token, issued once a login has been
-- proven but still matches more than one account.
ALTER TYPE "VerificationPurpose" ADD VALUE 'STUDIO_CHOICE';

ALTER TABLE "VerificationToken" ADD COLUMN "payload" JSONB;
