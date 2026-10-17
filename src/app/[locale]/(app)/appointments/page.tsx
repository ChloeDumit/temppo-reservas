import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { requireStudentProfile } from "@/lib/auth/guards";
import { whenText } from "@/lib/appointments/whatsapp-text";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader, EmptyState, SectionLabel } from "@/components/ui/page-header";
import { STATUS_TONE } from "../agenda/appointment-sheet";
import { cancelMyAppointmentAction } from "./actions";

export default async function MyAppointmentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, profile } = await requireStudentProfile();
  const studio = user.studio;
  if (studio.vertical !== "APPOINTMENTS") redirect({ href: "/my", locale });
  const t = await getTranslations("myAppointments");
  const ta = await getTranslations("agenda");

  const now = new Date();
  const appointments = await db.appointment.findMany({
    where: { clientId: profile.id, status: { not: "EXPIRED" } },
    orderBy: { startsAt: "desc" },
    take: 50,
    include: { staff: { select: { name: true } } },
  });
  const upcoming = appointments
    .filter((a) => a.startsAt > now && (a.status === "CONFIRMED" || a.status === "PENDING_PAYMENT"))
    .reverse();
  const past = appointments.filter((a) => !upcoming.includes(a));
  const cutoffMs = studio.cancellationCutoffHours * 3_600_000;

  const row = (a: (typeof appointments)[number], canCancel: boolean) => (
    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{a.serviceName}</p>
        <p className="text-xs text-muted">
          {whenText(a.startsAt, { timezone: studio.timezone, locale })} · {a.staff.name}
        </p>
      </div>
      {canCancel ? (
        <form action={cancelMyAppointmentAction}>
          <input type="hidden" name="id" value={a.id} />
          <Button type="submit" size="sm" variant="ghost">
            {a.startsAt.getTime() - now.getTime() < cutoffMs && a.depositStatus === "PAID" ? t("cancelLosesDeposit") : t("cancel")}
          </Button>
        </form>
      ) : (
        <Badge tone={STATUS_TONE[a.status]}>{ta(`status${a.status}` as "statusCONFIRMED")}</Badge>
      )}
    </li>
  );

  return (
    <>
      <PageHeader title={t("title")} action={<ButtonLink href={`/b/${studio.slug}`} size="sm">{t("book")}</ButtonLink>} />
      <SectionLabel>{t("upcoming")}</SectionLabel>
      <Card className="mb-6">
        {upcoming.length === 0 ? <EmptyState message={t("none")} /> : <ul className="divide-y divide-line">{upcoming.map((a) => row(a, true))}</ul>}
      </Card>
      {past.length > 0 && (
        <>
          <SectionLabel>{t("past")}</SectionLabel>
          <Card>
            <ul className="divide-y divide-line">{past.map((a) => row(a, false))}</ul>
          </Card>
        </>
      )}
    </>
  );
}
