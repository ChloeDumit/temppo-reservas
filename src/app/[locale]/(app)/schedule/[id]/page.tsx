import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { formatDate, formatTime } from "@/lib/dates";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { Button, buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/app/icon";
import { AddStudentForm } from "./add-student-form";
import { attendanceAction, cancelClassAction, removeBookingAction } from "../actions";

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const user = await requireStaff();
  const studio = user.studio;
  const t = await getTranslations("schedule");
  const tb = await getTranslations("booking");
  const tc = await getTranslations("common");

  const klass = await db.classInstance.findFirst({
    where: { id, studioId: studio.id },
    include: {
      instructor: { include: { user: true } },
      location: true,
      bookings: {
        where: { status: { in: ["BOOKED", "ATTENDED", "NO_SHOW"] } },
        include: { student: { include: { user: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!klass) notFound();

  const bookedIds = new Set(klass.bookings.map((b) => b.studentId));
  const available = await db.studentProfile.findMany({
    where: {
      user: { studioId: studio.id, isActive: true },
      id: { notIn: [...bookedIds] },
    },
    include: { user: true },
    orderBy: { user: { name: "asc" } },
    take: 300,
  });

  const activeCount = klass.bookings.filter((b) => b.status !== "NO_SHOW").length;
  const isPast = klass.startsAt.getTime() < Date.now();

  return (
    <>
      <Link
        href="/schedule"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <Icon name="chevronLeft" className="size-4" />
        {t("title")}
      </Link>

      <PageHeader
        title={klass.name}
        description={`${formatDate(klass.startsAt, studio.timezone, locale)} · ${formatTime(
          klass.startsAt,
          studio.timezone,
          locale,
        )}–${formatTime(klass.endsAt, studio.timezone, locale)}`}
        action={
          klass.status === "CANCELLED" ? (
            <Badge tone="critical">{t("cancelled")}</Badge>
          ) : (
            <form action={cancelClassAction}>
              <input type="hidden" name="classInstanceId" value={klass.id} />
              <Button type="submit" variant="danger" size="sm">
                {t("cancelClass")}
              </Button>
            </form>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardBody className="space-y-3 text-sm">
            <Row label={t("instructor")} value={klass.instructor?.user.name ?? t("unassigned")} />
            <Row label={t("location")} value={klass.location?.name ?? "—"} />
            <Row
              label={t("attendees")}
              value={t("capacity", { booked: activeCount, capacity: klass.capacity })}
            />
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title={t("attendees")} />
          <CardBody className="space-y-4">
            {klass.status !== "CANCELLED" && (
              <AddStudentForm
                classInstanceId={klass.id}
                students={available.map((s) => ({ id: s.id, name: s.user.name }))}
              />
            )}

            {klass.bookings.length === 0 ? (
              <EmptyState message={t("noAttendees")} />
            ) : (
              <ul className="divide-y divide-line">
                {klass.bookings.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/students/${booking.studentId}`}
                        className="truncate text-sm font-medium text-ink hover:text-accent"
                      >
                        {booking.student.user.name}
                      </Link>
                      <p className="truncate text-xs text-muted">{booking.student.user.email}</p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                      {booking.status === "ATTENDED" && (
                        <Badge tone="positive">{tb("attended")}</Badge>
                      )}
                      {booking.status === "NO_SHOW" && (
                        <Badge tone="critical">{tb("noShow")}</Badge>
                      )}

                      {isPast && booking.status !== "ATTENDED" && (
                        <form action={attendanceAction}>
                          <input type="hidden" name="bookingId" value={booking.id} />
                          <input type="hidden" name="attended" value="true" />
                          <Button type="submit" variant="secondary" size="sm">
                            <Icon name="check" className="size-4" />
                            <span className="sr-only sm:not-sr-only">{t("markAttended")}</span>
                          </Button>
                        </form>
                      )}
                      {isPast && booking.status !== "NO_SHOW" && (
                        <form action={attendanceAction}>
                          <input type="hidden" name="bookingId" value={booking.id} />
                          <input type="hidden" name="attended" value="false" />
                          <Button type="submit" variant="ghost" size="sm">
                            {t("markNoShow")}
                          </Button>
                        </form>
                      )}
                      {!isPast && (
                        <form action={removeBookingAction}>
                          <input type="hidden" name="bookingId" value={booking.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            aria-label={t("removeBooking")}
                          >
                            <Icon name="x" className="size-4" />
                          </Button>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <p className="mt-6">
        <Link href="/schedule" className={buttonClass("ghost", "sm")}>
          {tc("back")}
        </Link>
      </p>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}
