import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { ensureInstances } from "@/lib/classes";
import { weeklyAvailability } from "@/lib/recurring";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/app/icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState, SectionLabel } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { AssignStandingSpotForm } from "./assign-form";
import { releaseStandingSpotAction, toggleStandingSpotAction } from "./actions";

/** Sunday-first to match JS getDay(). */
function weekdayNames(locale: string) {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 7 + i))));
}

export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireStaff();
  const studio = user.studio;
  const t = await getTranslations("availability");
  const ts = await getTranslations("schedule");

  await ensureInstances(studio);

  const [slots, students] = await Promise.all([
    weeklyAvailability(studio.id),
    db.studentProfile.findMany({
      where: { user: { studioId: studio.id, isActive: true } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const dayNames = weekdayNames(locale);
  const studentOptions = students.map((s) => ({ id: s.id, name: s.user.name }));
  const today = new Date().toISOString().slice(0, 10);

  // Group by weekday, Monday first.
  const byDay = new Map<number, typeof slots>();
  for (const slot of slots) {
    const list = byDay.get(slot.weekday) ?? [];
    list.push(slot);
    byDay.set(slot.weekday, list);
  }
  const orderedDays = [...byDay.keys()].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      {slots.length === 0 ? (
        <Card>
          <EmptyState message={t("empty")} />
        </Card>
      ) : (
        <div className="space-y-6">
          {orderedDays.map((weekday) => (
            <section key={weekday}>
              <SectionLabel>{dayNames[weekday]}</SectionLabel>

              <div className="space-y-3">
                {byDay.get(weekday)!.map((slot) => {
                  const activeFixed = slot.fixed.filter((f) => f.status === "ACTIVE");
                  const full = slot.freeSpots === 0;

                  return (
                    /*
                      Collapsed by default. The summary row carries everything
                      needed to scan availability — time, class, occupancy and
                      free places — so a whole week fits on one screen. Names
                      and controls are one tap away.
                    */
                    <details
                      key={`${slot.templateId}-${weekday}`}
                      className="card group overflow-hidden"
                    >
                      <summary className="pressable-row flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:content-none sm:px-5">
                        <span
                          className="h-9 w-1 shrink-0 rounded-full"
                          style={{ backgroundColor: slot.colorHex }}
                          aria-hidden
                        />

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="font-display text-base font-semibold tabular-nums text-ink">
                              {slot.startTime}
                            </span>
                            <span className="truncate text-[15px] text-ink">{slot.name}</span>
                          </span>

                          {/*
                            Filled pips are standing spots, hollow ones are open
                            every week. Past ten seats the pips get too cramped
                            to read, so a proportional bar takes over.
                          */}
                          <span className="mt-1 flex items-center gap-1.5">
                            {slot.capacity <= 10 ? (
                              <span className="flex items-center gap-1">
                                {Array.from({ length: slot.capacity }, (_, i) => (
                                  <span
                                    key={i}
                                    className={
                                      i < activeFixed.length
                                        ? "size-2 rounded-full bg-accent"
                                        : "size-2 rounded-full border border-line-strong bg-surface"
                                    }
                                    aria-hidden
                                  />
                                ))}
                              </span>
                            ) : (
                              <span
                                className="h-1.5 w-20 overflow-hidden rounded-full bg-sunken"
                                aria-hidden
                              >
                                <span
                                  className="block h-full rounded-full bg-accent"
                                  style={{
                                    width: `${(activeFixed.length / slot.capacity) * 100}%`,
                                  }}
                                />
                              </span>
                            )}
                            <span className="whitespace-nowrap text-[11px] tabular-nums text-muted">
                              {t("fixedCount", {
                                taken: activeFixed.length,
                                capacity: slot.capacity,
                              })}
                            </span>
                          </span>
                        </span>

                        <Badge tone={full ? "caution" : "positive"}>
                          {full
                            ? t("noneFree")
                            : slot.freeSpots === 1
                              ? t("oneFree")
                              : t("free", { count: slot.freeSpots })}
                        </Badge>

                        <Icon
                          name="chevronDown"
                          className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180"
                        />
                      </summary>

                      <div className="space-y-3 border-t border-line px-4 py-3.5 sm:px-5">
                        <p className="truncate text-xs text-muted">
                          {slot.instructorName ?? ts("unassigned")}
                          {slot.locationName ? ` · ${slot.locationName}` : ""} ·{" "}
                          {slot.durationMins}′
                        </p>

                        {slot.fixed.length === 0 ? (
                          <p className="text-sm text-muted">{t("noFixed")}</p>
                        ) : (
                          <ul className="divide-y divide-line rounded-md bg-sunken/60">
                            {slot.fixed.map((entry) => (
                              <li
                                key={entry.id}
                                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                              >
                                <span className="flex items-center gap-2 text-sm text-ink">
                                  {entry.studentName}
                                  {entry.status === "PAUSED" && (
                                    <Badge tone="caution">{t("paused")}</Badge>
                                  )}
                                </span>
                                <span className="flex shrink-0 gap-1">
                                  <form action={toggleStandingSpotAction}>
                                    <input type="hidden" name="id" value={entry.id} />
                                    <Button type="submit" variant="ghost" size="sm">
                                      {entry.status === "ACTIVE" ? t("pause") : t("resume")}
                                    </Button>
                                  </form>
                                  <form action={releaseStandingSpotAction}>
                                    <input type="hidden" name="id" value={entry.id} />
                                    <Button type="submit" variant="ghost" size="sm">
                                      {t("release")}
                                    </Button>
                                  </form>
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {!full && (
                          <SheetForm
                            label={t("addFixed")}
                            title={`${dayNames[weekday]} ${slot.startTime} · ${slot.name}`}
                            variant="secondary"
                            className="w-full sm:w-auto"
                          >
                            <AssignStandingSpotForm
                              classTemplateId={slot.templateId}
                              students={studentOptions}
                              today={today}
                            />
                          </SheetForm>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
