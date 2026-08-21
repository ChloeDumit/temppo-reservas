import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStudentProfile } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { currentLocationId, locationScope } from "@/lib/locations";
import { ensureInstances } from "@/lib/classes";
import { creditsRemaining } from "@/lib/booking";
import { sweepExpiredOffers } from "@/lib/waitlist";
import { addDays, dateKeyInZone, formatTime, startOfDayInZone, wallTimeToUtc } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { BookButton, JoinWaitlistButton, LeaveWaitlistButton } from "./book-button";

export default async function BookPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user, profile } = await requireStudentProfile();

  const studio = user.studio;
  const t = await getTranslations("booking");
  const ts = await getTranslations("schedule");

  await ensureInstances(studio);
  // Any offer whose window ran out passes to the next student on this read.
  await sweepExpiredOffers(studio);

  const now = new Date();
  const horizonEnd = addDays(startOfDayInZone(now, studio.timezone), studio.bookingOpensDaysAhead);

  // Students switch sucursal with the same control staff use.
  const locationId = await currentLocationId(studio.id);

  const [instances, myBookings, credits] = await Promise.all([
    db.classInstance.findMany({
      where: {
        studioId: studio.id,
        status: "SCHEDULED",
        startsAt: { gt: now, lte: horizonEnd },
        ...locationScope(locationId),
      },
      orderBy: { startsAt: "asc" },
      include: {
        instructor: { include: { user: true } },
        location: true,
        _count: { select: { bookings: { where: { status: { in: ["BOOKED", "ATTENDED"] } } } } },
      },
      take: 200,
    }),
    db.booking.findMany({
      where: { studentId: profile.id, status: "BOOKED" },
      select: { classInstanceId: true },
    }),
    creditsRemaining(profile.id),
  ]);

  const bookedIds = new Set(myBookings.map((b) => b.classInstanceId));

  // Where this student sits in each queue they're on.
  const myWaitlist = await db.waitlistEntry.findMany({
    where: {
      studentId: profile.id,
      status: { in: ["WAITING", "OFFERED"] },
      classInstanceId: { in: instances.map((i) => i.id) },
    },
  });
  const aheadCounts = await Promise.all(
    myWaitlist.map((entry) =>
      db.waitlistEntry.count({
        where: {
          classInstanceId: entry.classInstanceId,
          status: { in: ["WAITING", "OFFERED"] },
          position: { lt: entry.position },
        },
      }),
    ),
  );
  const waitlistByClass = new Map(
    myWaitlist.map((entry, index) => [entry.classInstanceId, aheadCounts[index] + 1]),
  );

  const byDay = new Map<string, typeof instances>();
  for (const instance of instances) {
    const key = dateKeyInZone(instance.startsAt, studio.timezone);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(instance);
  }

  return (
    <>
      <PageHeader
        title={t("title")}
        description={
          credits === null
            ? t("creditsUnlimited")
            : t("creditsLeft", { count: credits })
        }
      />

      {profile.bookingBlocked && (
        <p className="mb-4 rounded-lg bg-critical-soft px-4 py-2.5 text-sm text-critical">
          {t("blocked")}
        </p>
      )}

      {credits === 0 && (
        <p className="mb-4 rounded-lg bg-caution-soft px-4 py-2.5 text-sm text-caution">
          {t("noCredits")}
        </p>
      )}

      {instances.length === 0 ? (
        <Card>
          <EmptyState message={ts("noClassesWeek")} />
        </Card>
      ) : (
        <div className="space-y-5">
          {[...byDay.entries()].map(([dayKey, dayClasses]) => (
            <section key={dayKey}>
              <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                {new Intl.DateTimeFormat(locale, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: studio.timezone,
                }).format(wallTimeToUtc(dayKey, "12:00", studio.timezone))}
              </h2>

              <Card>
                <ul className="divide-y divide-line">
                  {dayClasses.map((klass) => {
                    const booked = klass._count.bookings;
                    const isFull = booked >= klass.capacity;
                    const alreadyBooked = bookedIds.has(klass.id);
                    const spots = klass.capacity - booked;

                    return (
                      <li
                        key={klass.id}
                        className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
                      >
                        <span
                          className="h-10 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: klass.colorHex }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">
                            {formatTime(klass.startsAt, studio.timezone, locale)} · {klass.name}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {klass.instructor?.user.name ?? ts("unassigned")}
                            {klass.location ? ` · ${klass.location.name}` : ""}
                          </p>
                        </div>

                        <div className="shrink-0">
                          {alreadyBooked ? (
                            <Badge tone="positive">{t("booked")}</Badge>
                          ) : waitlistByClass.has(klass.id) ? (
                            <LeaveWaitlistButton
                              classInstanceId={klass.id}
                              position={waitlistByClass.get(klass.id)!}
                            />
                          ) : isFull ? (
                            <div className="flex items-center gap-2">
                              <Badge tone="caution">{t("full")}</Badge>
                              <JoinWaitlistButton classInstanceId={klass.id} />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted">
                                {spots === 1 ? ts("oneSpotLeft") : ts("spotsLeft", { count: spots })}
                              </span>
                              <BookButton classInstanceId={klass.id} />
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
