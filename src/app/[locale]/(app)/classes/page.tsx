import { getTranslations, setRequestLocale } from "next-intl/server";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
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

  const [templates, instructors, locations] = await Promise.all([
    db.classTemplate.findMany({
      where: { studioId: studio.id },
      orderBy: [{ isActive: "desc" }, { startTime: "asc" }],
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
        <div className="space-y-3">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="mt-1 size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: template.colorHex }}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-ink">
                        {template.name}
                        {!template.isActive && <Badge>{tc("inactive")}</Badge>}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {[...template.weekdays]
                          .sort((a, b) => a - b)
                          .map((d) => labels[d])
                          .join(", ")}{" "}
                        · {template.startTime} · {template.durationMins}′
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {template.instructor?.user.name ?? ts("unassigned")}
                        {template.location ? ` · ${template.location.name}` : ""} ·{" "}
                        {t("capacity")}: {template.capacity}
                      </p>
                    </div>
                  </div>

                  <form action={toggleTemplateAction}>
                    <input type="hidden" name="id" value={template.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {template.isActive ? t("deactivate") : t("activate")}
                    </Button>
                  </form>
                </div>

                <div>
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
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <p className="mt-5 text-xs text-muted">
        {t("generateInfo", { days: studio.bookingOpensDaysAhead })}
      </p>
    </>
  );
}
