import { getTranslations, setRequestLocale } from "next-intl/server";
import { db } from "@/lib/db";
import { ADMIN_ROLES } from "@/lib/auth/guards";
import { requireAppointmentStaff } from "@/lib/appointments/guards";
import { dateKeyInZone, formatDateTime } from "@/lib/dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState, SectionLabel } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { HoursForm, type DayShifts } from "./hours-form";
import { TimeOffForm } from "./time-off-form";
import { RulesForm } from "./rules-form";
import { deleteTimeOffAction } from "./actions";

function hhmm(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export default async function HoursPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireAppointmentStaff();
  const studio = user.studio;
  const isAdmin = ADMIN_ROLES.includes(user.role);
  const t = await getTranslations("hours");
  const tc = await getTranslations("common");

  const now = new Date();
  const [staff, hours, blocks] = await Promise.all([
    db.user.findMany({
      where: {
        studioId: studio.id,
        isActive: true,
        role: { in: ["OWNER", "ADMIN", "INSTRUCTOR"] },
        // A professional sees and edits only her own week.
        ...(isAdmin ? {} : { id: user.id }),
      },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    db.workingHours.findMany({ where: { studioId: studio.id }, orderBy: { startMin: "asc" } }),
    db.timeOff.findMany({
      where: { studioId: studio.id, endsAt: { gt: now }, ...(isAdmin ? {} : { OR: [{ staffId: user.id }, { staffId: null }] }) },
      include: { staff: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
      take: 50,
    }),
  ]);

  // Sunday-first names from a known Sunday, in the viewer's language.
  const dayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 0, 4 + i))),
  ).map((d) => d.charAt(0).toUpperCase() + d.slice(1));

  const weekFor = (staffId: string): DayShifts[] =>
    Array.from({ length: 7 }, (_, weekday) =>
      hours
        .filter((h) => h.staffId === staffId && h.weekday === weekday)
        .map((h) => ({ from: hhmm(h.startMin), to: hhmm(h.endMin) })),
    );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        action={
          <SheetForm label={t("newBlock")} title={t("newBlock")}>
            <TimeOffForm
              staff={staff}
              defaultStaffId={user.id}
              canCloseStudio={isAdmin}
              today={dateKeyInZone(now, studio.timezone)}
            />
          </SheetForm>
        }
      />

      <div className="space-y-4">
        {staff.map((s) => (
          <Card key={s.id}>
            <CardHeader title={staff.length > 1 ? s.name : t("yourWeek")} />
            <CardBody>
              <HoursForm staffId={s.id} week={weekFor(s.id)} dayNames={dayNames} />
            </CardBody>
          </Card>
        ))}
      </div>

      <section className="mt-8">
        <SectionLabel>{t("blocks")}</SectionLabel>
        {blocks.length === 0 ? (
          <Card>
            <EmptyState message={t("noBlocks")} />
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {blocks.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {b.staff?.name ?? t("wholeStudio")}
                      {b.reason && <span className="font-normal text-muted"> · {b.reason}</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(b.startsAt, studio.timezone, locale)} → {formatDateTime(b.endsAt, studio.timezone, locale)}
                    </p>
                  </div>
                  <form action={deleteTimeOffAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      {tc("delete")}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      {isAdmin && (
        <section className="mt-8">
          <SectionLabel>{t("rules")}</SectionLabel>
          <Card>
            <CardBody>
              <RulesForm
                rules={{
                  minNoticeMinutes: studio.minNoticeMinutes,
                  bookingOpensDaysAhead: studio.bookingOpensDaysAhead,
                  slotStepMinutes: studio.slotStepMinutes,
                  cancellationCutoffHours: studio.cancellationCutoffHours,
                  holdMinutes: studio.holdMinutes,
                  depositRefundable: studio.depositRefundable,
                  acceptMercadoPago: studio.acceptMercadoPago,
                  acceptTransfer: studio.acceptTransfer,
                  hasWhatsapp: Boolean(studio.whatsappNumber),
                }}
              />
            </CardBody>
          </Card>
        </section>
      )}
    </>
  );
}
