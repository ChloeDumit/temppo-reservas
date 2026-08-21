-- CreateTable
CREATE TABLE "_LocationToStudentProfile" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LocationToStudentProfile_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_LocationToStudentProfile_B_index" ON "_LocationToStudentProfile"("B");

-- AddForeignKey
ALTER TABLE "_LocationToStudentProfile" ADD CONSTRAINT "_LocationToStudentProfile_A_fkey" FOREIGN KEY ("A") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LocationToStudentProfile" ADD CONSTRAINT "_LocationToStudentProfile_B_fkey" FOREIGN KEY ("B") REFERENCES "StudentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: every existing student joins the sucursales their studio already
-- has. Without this they would belong to none, and a location-scoped student
-- list would come back empty on day one.
INSERT INTO "_LocationToStudentProfile" ("A", "B")
SELECT l."id", sp."id"
FROM "StudentProfile" sp
JOIN "User" u ON u."id" = sp."userId"
JOIN "Location" l ON l."studioId" = u."studioId" AND l."isActive" = true
ON CONFLICT DO NOTHING;
