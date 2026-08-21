-- AlterTable
ALTER TABLE "RecurringBooking" ADD COLUMN     "weekdays" INTEGER[];

-- Existing spots covered every weekday their template ran, so copy those days
-- across. Without this they would land with an empty set and silently stop
-- generating bookings.
UPDATE "RecurringBooking" rb
SET "weekdays" = ct."weekdays"
FROM "ClassTemplate" ct
WHERE ct."id" = rb."classTemplateId";
