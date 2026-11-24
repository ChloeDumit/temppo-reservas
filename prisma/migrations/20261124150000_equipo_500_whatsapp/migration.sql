-- Equipo now includes 500 automatic WhatsApp messages a month, up from 300.
-- Studios already on it get them now rather than at their next payment; one
-- whose quota was changed by hand keeps it.
UPDATE "Studio" SET "waMonthlyQuota" = 500
WHERE "brand" = 'beauty' AND "plan" = 'STUDIO' AND "waMonthlyQuota" = 300;
