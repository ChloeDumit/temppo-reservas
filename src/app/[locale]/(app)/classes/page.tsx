import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { currentLocationId, locationScope } from "@/lib/locations";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState, SectionLabel } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { Icon } from "@/components/app/icon";
import { TemplateForm } from "./template-form";
import { toggleTemplateAction } from "./actions";

/** Sunday-first labels to match JS getDay(). */
function weekdayLabels(locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  // 2024-01-07 was a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    formatter.format(new Date(Date.UTC(2024, 0, 7 + i))),
  );
}

export default async function ClassesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireStaff();
  const studio = user.studio;
  const t = await getTranslations("classes");
  const tc = await getTranslations("common");
  const ts = await getTranslations("schedule");

  const locationId = await currentLocationId(studio.id);

  const [templates, instructors, locations] = await Promise.all([
    db.classTemplate.findMany({
      where: { studioId: studio.id, ...locationScope(locationId) },
      orderBy: [{ isActive: "desc" }, { startTime: "asc" }],
      // Grouped by weekday pattern below — the schedule reads that way, and
      // ordering by time alone piles every 08:00 from every day together.
      include: { instructor: { include: { user: true } }, location: true },
    }),
    db.instructorProfile.findMany({
      where: { user: { studioId: studio.id, isActive: true } },
      include: { user: true },
      orderBy: { user: { name: "asc" } },
    }),
    db.location.findMany({ where: { studioId: studio.id, isActive: true } }),
  ]);

  const labels = weekdayLabels(locale);

  /**
   * Groups templates by the set of days they run on, so a studio sees its
   * timetable the way it thinks about it — the Mon/Wed/Fri block, then Tue/Thu,
   * then Saturday — rather than one flat list sorted by clock time.
   *
   * Monday leads, matching the schedule; Sunday is 0 in JS, so it sorts last.
   */
  const mondayFirst = (day: number) => (day + 6) % 7;

  const groups = new Map<string, { days: number[]; items: typeof templates }>();
  for (const template of templates) {
    const days = [...template.weekdays].sort((a, b) => mondayFirst(a) - mondayFirst(b));
    const key = days.join(",");
    const group = groups.get(key) ?? { days, items: [] as typeof templates };
    group.items.push(template);
    groups.set(key, group);
  }

  const ordered = [...groups.values()]
    .map((group) => ({
      ...group,
      label: group.days.map((d) => labels[d]).join(" · "),
      items: [...group.items].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
    // Earliest day first; same first day, earliest class first.
    .sort(
      (a, b) =>
        mondayFirst(a.days[0] ?? 0) - mondayFirst(b.days[0] ?? 0) ||
        (a.items[0]?.startTime ?? "").localeCompare(b.items[0]?.startTime ?? ""),
    );
  const instructorOptions = instructors.map((i) => ({ id: i.id, name: i.user.name }));
  const locationOptions = locations.map((l) => ({ id: l.id, name: l.name }));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <SheetForm label={t("newTemplate")} title={t("newTemplate")}>
            <TemplateForm
              values={{
            name: "",
            description: "",
            colorHex: "#C0563C",
            capacity: 10,
            durationMins: 60,
            weekdays: [],
            startTime: "09:00",
            startDate: today,
            endDate: "",
            instructorId: "",
                locationId: locationOptions[0]?.id ?? "",
              }}
              instructors={instructorOptions}
              locations={locationOptions}
              weekdayLabels={labels}
            />
          </SheetForm>
        }
      />

      {templates.length === 0 ? (
        <Card>
          <EmptyState message={t("empty")} />
        </Card>
      ) : (
        <div className="space-y-6">
          {ordered.map((group) => (
            <section key={group.days.join(",")}>
              <SectionLabel>{group.label}</SectionLabel>
              <div className="space-y-3">
          {group.items.map((template) => (
            <Card key={template.id}>
              <CardBody className="space-y-2.5">
                {/*
                  The days are already the section heading, so the row leads
                  with the time — the one thing that separates it from its
                  neighbours — and keeps the rest to a single line.
                */}
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1.5 h-8 w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: template.colorHex }}
                    aria-hidden
                  />

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-display text-lg font-semibold tabular-nums text-ink">
                        {template.startTime}
                      </span>
                      <span className="truncate text-[15px] text-ink">{template.name}</span>
                      {!template.isActive && <Badge>{tc("inactive")}</Badge>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {template.instructor?.user.name ?? ts("unassigned")} · {template.durationMins}
                      ′ · {t("capacity")}: {template.capacity}
                    </p>
                  </div>

                  {/* Both actions sit on the row, so a long timetable stays scannable. */}
                  <div className="flex shrink-0 items-center gap-1">
                    <SheetForm
                    label={tc("edit")}
                    title={t("editTemplate")}
                    variant="secondary"
                    icon={null}
                  >
                    <TemplateForm
                      values={{
                        id: template.id,
                        name: template.name,
                        description: template.description ?? "",
                        colorHex: template.colorHex,
                        capacity: template.capacity,
                        durationMins: template.durationMins,
                        weekdays: template.weekdays,
                        startTime: template.startTime,
                        startDate: template.startDate.toISOString().slice(0, 10),
                        endDate: template.endDate?.toISOString().slice(0, 10) ?? "",
                        instructorId: template.instructorId ?? "",
                        locationId: template.locationId ?? "",
                      }}
                      instructors={instructorOptions}
                      locations={locationOptions}
                      weekdayLabels={labels}
                    />
                    </SheetForm>

                    {/*
                      Icon-only on a phone: turning a class off is rare, and
                      the label costs the width the class name needs.
                    */}
                    <form action={toggleTemplateAction}>
                      <input type="hidden" name="id" value={template.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        aria-label={template.isActive ? t("deactivate") : t("activate")}
                        title={template.isActive ? t("deactivate") : t("activate")}
                      >
                        <Icon
                          name={template.isActive ? "x" : "check"}
                          className="size-4 sm:hidden"
                        />
                        <span className="hidden sm:inline">
                          {template.isActive ? t("deactivate") : t("activate")}
                        </span>
                      </Button>
                    </form>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-5 text-xs text-muted">
        {t("generateInfo", { days: studio.bookingOpensDaysAhead })}
      </p>
    </>
  );
}
