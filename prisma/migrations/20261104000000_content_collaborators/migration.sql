-- AlterTable
ALTER TABLE "ContentPost" ADD COLUMN     "collaborators" TEXT[] DEFAULT ARRAY['temppo.uy']::TEXT[];

-- What already went up keeps going without: only what is still to come is shared.
UPDATE "ContentPost" SET "collaborators" = ARRAY[]::TEXT[] WHERE "status" IN ('PUBLISHED', 'PUBLISHING');
