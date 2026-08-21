import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { currentLocationId, locationScope } from "@/lib/locations";
import { formatTime, startOfDayInZone, addDays } from "@/lib/dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { CheckInScanner } from "./scanner";

const STATUS_TONE = {
  ok: "positive",
  already: "caution",
  cancelled: "critical",
  wrongtime: "caution",
  invalid: "critical",
  forbidden: "critical",
} as const;

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string; name?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { status, name } = await searchParams;

  const user = await requireStaff();
  const studio = user.studio;
  const t = await getTranslations("checkin");
  const ts = await getTranslations("schedule");

  const now = new Date();
  const dayStart = startOfDayInZone(now, studio.timezone);

  // Classes within a couple of hours either way — what the desk needs right now.
  const locationId = await currentLocationId(studio.id);

  const soon = await db.classInstance.findMany({
    where: {
      studioId: studio.id,
      status: "SCHEDULED",
      startsAt: { gte: dayStart, lt: addDays(dayStart, 1) },
      ...locationScope(locationId),
    },
    orderBy: { startsAt: "asc" },
    include: {
      bookings: {
        where: { status: { in: ["BOOKED", "ATTENDED"] } },
        include: { student: { include: { user: true } } },
        orderBy: { student: { user: { name: "asc" } } },
      },
    },
  });

  const statusKey = status
    ? (`status${status.charAt(0).toUpperCase()}${status.slice(1)}` as const)
    : null;

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      {statusKey && (
        <p
          className={`mb-4 rounded-lg px-4 py-2.5 text-sm ${
            STATUS_TONE[status as keyof typeof STATUS_TONE] === "positive"
              ? "bg-positive-soft text-positive"
              : STATUS_TONE[status as keyof typeof STATUS_TONE] === "caution"
                ? "bg-caution-soft text-caution"
                : "bg-critical-soft text-critical"
          }`}
        >
          {t(statusKey, { name: name ?? "" })}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("scan")} />
          <CardBody>
            <CheckInScanner />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={ts("attendees")} />
          {soon.length === 0 ? (
            <EmptyState message={ts("noClassesWeek")} />
          ) : (
            <div className="divide-y divide-line">
              {soon.map((klass) => (
                <div key={klass.id} className="px-4 py-3 sm:px-5">
                  <p className="text-sm font-medium">
                    {formatTime(klass.startsAt, studio.timezone, locale)} · {klass.name}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {klass.bookings.length === 0 && (
                      <li className="text-xs text-muted">{ts("noAttendees")}</li>
                    )}
                    {klass.bookings.map((booking) => (
                      <li
                        key={booking.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate">{booking.student.user.name}</span>
                        {booking.status === "ATTENDED" && (
                          <Badge tone="positive">✓</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
