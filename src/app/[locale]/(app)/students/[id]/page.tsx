import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { listLocations } from "@/lib/locations";
import { ageFrom, formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { SheetForm } from "@/components/app/sheet-form";
import { Icon } from "@/components/app/icon";
import { StudentForm } from "../student-form";
import {
  resetNoShowsAction,
  toggleBlockAction,
  toggleStudentActiveAction,
} from "../actions";

const BOOKING_TONE = {
  BOOKED: "accent",
  ATTENDED: "positive",
  NO_SHOW: "critical",
  CANCELLED: "neutral",
  LATE_CANCELLED: "caution",
} as const;

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requireStaff();
  const studio = user.studio;
  const t = await getTranslations("students");
  const tc = await getTranslations("common");
  const tp = await getTranslations("payments");
  const tb = await getTranslations("booking");

  const locations = await listLocations(studio.id);

  const student = await db.studentProfile.findFirst({
    where: { id, user: { studioId: studio.id } },
    include: {
      user: true,
      packs: { include: { pack: true }, orderBy: { createdAt: "desc" }, take: 20 },
      bookings: {
        include: { classInstance: true },
        orderBy: { classInstance: { startsAt: "desc" } },
        take: 25,
      },
      payments: { orderBy: { createdAt: "desc" }, take: 25 },
      locations: { select: { id: true } },
    },
  });

  if (!student) notFound();

  const money = (cents: number) => formatMoney(cents, studio.currency, locale);
  const activePacks = student.packs.filter(
    (pack) => pack.status === "ACTIVE" && pack.expiresAt > new Date(),
  );

  return (
    <>
      <Link
        href="/students"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <Icon name="chevronLeft" className="size-4" />
        {t("title")}
      </Link>

      <PageHeader
        title={student.user.name}
        description={[
          student.user.email,
          student.birthDate ? t("age", { age: ageFrom(student.birthDate) }) : null,
          student.user.phone,
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex flex-wrap gap-2">
            <form action={toggleBlockAction}>
              <input type="hidden" name="id" value={student.id} />
              <Button type="submit" variant={student.bookingBlocked ? "secondary" : "danger"} size="sm">
                {student.bookingBlocked ? t("unblock") : t("block")}
              </Button>
            </form>
            <form action={toggleStudentActiveAction}>
              <input type="hidden" name="id" value={student.id} />
              <Button type="submit" variant="ghost" size="sm">
                {student.user.isActive ? t("deactivate") : t("reactivate")}
              </Button>
            </form>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {!student.user.isActive && <Badge>{tc("inactive")}</Badge>}
        {student.bookingBlocked && <Badge tone="critical">{t("blocked")}</Badge>}
        <Badge tone={student.noShowCount > 0 ? "caution" : "neutral"}>
          {t("noShows", { count: student.noShowCount })}
        </Badge>
        {student.noShowCount > 0 && (
          <form action={resetNoShowsAction}>
            <input type="hidden" name="id" value={student.id} />
            <button type="submit" className="text-xs text-accent underline underline-offset-4">
              {t("resetNoShows")}
            </button>
          </form>
        )}
      </div>

      {(student.healthNotes || student.emergencyContact) && (
        <Card className="mb-4">
          <CardBody className="space-y-2 text-sm">
            {student.healthNotes && (
              <p>
                <span className="text-muted">{t("healthNotes")}: </span>
                {student.healthNotes}
              </p>
            )}
            {student.emergencyContact && (
              <p>
                <span className="text-muted">{t("emergencyContact")}: </span>
                {student.emergencyContact}
                {student.emergencyPhone ? ` · ${student.emergencyPhone}` : ""}
              </p>
            )}
            {student.notes && (
              <p>
                <span className="text-muted">{t("notes")}: </span>
                {student.notes}
              </p>
            )}
          </CardBody>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader title={t("activePacks")} />
        {activePacks.length === 0 ? (
          <EmptyState message={tb("noCredits")} />
        ) : (
          <ul className="divide-y divide-line">
            {activePacks.map((pack) => (
              <li key={pack.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                <div>
                  <p className="text-sm font-medium">{pack.pack.name}</p>
                  <p className="text-xs text-muted">
                    {t("expiresOn", { date: formatDate(pack.expiresAt, studio.timezone, locale) })}
                  </p>
                </div>
                <Badge tone="accent">
                  {pack.isUnlimited
                    ? t("unlimited")
                    : t("credits", { used: pack.creditsUsed, total: pack.creditsTotal })}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("bookingHistory")} />
          {student.bookings.length === 0 ? (
            <EmptyState message={tb("noUpcoming")} />
          ) : (
            <ul className="divide-y divide-line">
              {student.bookings.map((booking) => (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{booking.classInstance.name}</p>
                    <p className="text-xs text-muted">
                      {formatDateTime(booking.classInstance.startsAt, studio.timezone, locale)}
                    </p>
                  </div>
                  <Badge tone={BOOKING_TONE[booking.status]}>{booking.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={t("paymentHistory")} />
          {student.payments.length === 0 ? (
            <EmptyState message={tp("empty")} />
          ) : (
            <ul className="divide-y divide-line">
              {student.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-5"
                >
                  <div className="min-w-0">
                    <p className="text-sm tabular-nums">{money(payment.amountCents)}</p>
                    <p className="text-xs text-muted">
                      {tp(`method${payment.method}`)} ·{" "}
                      {formatDate(payment.createdAt, studio.timezone, locale)}
                    </p>
                  </div>
                  <Badge
                    tone={
                      payment.status === "APPROVED"
                        ? "positive"
                        : payment.status === "PENDING"
                          ? "caution"
                          : "critical"
                    }
                  >
                    {tp(`status${payment.status}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <SheetForm
          label={t("editStudent")}
          title={t("editStudent")}
          variant="secondary"
          icon={null}
        >
        <StudentForm
          locations={locations}
          values={{
            id: student.id,
            name: student.user.name,
            email: student.user.email ?? "",
            documentId: student.user.documentId ?? "",
            locationIds: student.locations.map((location) => location.id),
            phone: student.user.phone ?? "",
            birthDate: student.birthDate?.toISOString().slice(0, 10) ?? "",
            healthNotes: student.healthNotes ?? "",
            emergencyContact: student.emergencyContact ?? "",
            emergencyPhone: student.emergencyPhone ?? "",
            notes: student.notes ?? "",
          }}
        />
        </SheetForm>
      </div>
    </>
  );
}
