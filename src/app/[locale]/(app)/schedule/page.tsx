import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ensureInstances } from "@/lib/classes";
import {
  addDays,
  dateKeyInZone,
  formatTime,
  startOfWeekInZone,
  wallTimeToUtc,
} from "@/lib/dates";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/app/icon";
import { LocationFilter } from "@/components/app/location-filter";

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string; location?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { week, location } = await searchParams;

  const user = await requireStaff();
  const studio = user.studio;
  const t = await getTranslations("schedule");

  await ensureInstances(studio);

  const anchor =
    week && /^\d{4}-\d{2}-\d{2}$/.test(week)
      ? wallTimeToUtc(week, "12:00", studio.timezone)
      : new Date();

  const weekStart = startOfWeekInZone(anchor, studio.timezone);
  const weekEnd = addDays(weekStart, 7);

  const locations = await db.location.findMany({
    where: { studioId: studio.id, isActive: true },
    orderBy: { name: "asc" },
  });

  // Only filter when the chosen location actually belongs to this studio.
  const locationId = locations.some((l) => l.id === location) ? location : undefined;

  const instances = await db.classInstance.findMany({
    where: {
      studioId: studio.id,
      startsAt: { gte: weekStart, lt: weekEnd },
      ...(locationId ? { locationId } : {}),
    },
    orderBy: { startsAt: "asc" },
    include: {
      instructor: { include: { user: true } },
      location: true,
      _count: { select: { bookings: { where: { status: { in: ["BOOKED", "ATTENDED"] } } } } },
    },
  });

  // Bucket by studio-local day so a class at 23:00 lands on the right column.
  const byDay = new Map<string, typeof instances>();
  for (let i = 0; i < 7; i++) {
    byDay.set(dateKeyInZone(addDays(weekStart, i), studio.timezone), []);
  }
  for (const instance of instances) {
    const key = dateKeyInZone(instance.startsAt, studio.timezone);
    byDay.get(key)?.push(instance);
  }

  const todayKey = dateKeyInZone(new Date(), studio.timezone);
  const prevWeek = dateKeyInZone(addDays(weekStart, -7), studio.timezone);
  const nextWeek = dateKeyInZone(addDays(weekStart, 7), studio.timezone);

  const rangeLabel = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: studio.timezone,
  }).formatRange(weekStart, addDays(weekStart, 6));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={rangeLabel}
        action={
          <Link href="/classes" className={buttonClass("primary", "sm")}>
            <Icon name="plus" className="size-4" />
            {t("newClass")}
          </Link>
        }
      />

      <div className="mb-4 flex items-center gap-2">
        <Link
          href={{ pathname: "/schedule", query: { week: prevWeek, ...(locationId ? { location: locationId } : {}) } }}
          className={buttonClass("secondary", "sm")}
          aria-label={t("prevWeek")}
        >
          <Icon name="chevronLeft" className="size-4" />
        </Link>
        <Link href="/schedule" className={buttonClass("ghost", "sm")}>
          {t("title")}
        </Link>
        <Link
          href={{ pathname: "/schedule", query: { week: nextWeek, ...(locationId ? { location: locationId } : {}) } }}
          className={buttonClass("secondary", "sm")}
          aria-label={t("nextWeek")}
        >
          <Icon name="chevronRight" className="size-4" />
        </Link>

        {locations.length > 1 && (
          <div className="ml-auto">
            <LocationFilter
              locations={locations.map((l) => ({ id: l.id, name: l.name }))}
              selected={locationId}
              week={week}
              allLabel={t("allLocations")}
              label={t("location")}
            />
          </div>
        )}
      </div>

      {instances.length === 0 ? (
        <Card>
          <EmptyState
            message={t("noClassesWeek")}
            action={
              <Link href="/classes" className={buttonClass("primary", "sm")}>
                {t("newClass")}
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-7 lg:gap-2">
          {[...byDay.entries()].map(([dayKey, dayClasses]) => {
            const dayDate = wallTimeToUtc(dayKey, "12:00", studio.timezone);
            const isToday = dayKey === todayKey;

            return (
              <section key={dayKey} className={dayClasses.length === 0 ? "hidden lg:block" : ""}>
                <h2
                  className={`mb-2 flex items-baseline gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide ${
                    isToday ? "text-accent" : "text-muted"
                  }`}
                >
                  {new Intl.DateTimeFormat(locale, {
                    weekday: "short",
                    timeZone: studio.timezone,
                  }).format(dayDate)}
                  <span className="font-normal normal-case tracking-normal">
                    {new Intl.DateTimeFormat(locale, {
                      day: "numeric",
                      timeZone: studio.timezone,
                    }).format(dayDate)}
                  </span>
                </h2>

                <div className="space-y-2">
                  {dayClasses.length === 0 && (
                    <p className="hidden px-1 text-xs text-muted lg:block">—</p>
                  )}
                  {dayClasses.map((klass) => {
                    const booked = klass._count.bookings;
                    const full = booked >= klass.capacity;
                    const cancelled = klass.status === "CANCELLED";

                    return (
                      <Link
                        key={klass.id}
                        href={`/schedule/${klass.id}`}
                        className={`pressable block rounded-lg border border-line bg-surface p-3 active:bg-sunken sm:hover:border-line-strong ${
                          cancelled ? "opacity-60" : ""
                        }`}
                        style={{ borderLeft: `3px solid ${klass.colorHex}` }}
                      >
                        <p className="text-sm font-semibold tabular-nums text-ink">
                          {formatTime(klass.startsAt, studio.timezone, locale)}
                        </p>
                        <p className="mt-0.5 truncate text-sm text-ink">{klass.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted">
                          {klass.instructor?.user.name ?? t("unassigned")}
                        </p>
                        <div className="mt-2">
                          {cancelled ? (
                            <Badge tone="critical">{t("cancelled")}</Badge>
                          ) : full ? (
                            <Badge tone="caution">{t("full")}</Badge>
                          ) : (
                            <span className="text-xs tabular-nums text-muted">
                              {t("capacity", { booked, capacity: klass.capacity })}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
