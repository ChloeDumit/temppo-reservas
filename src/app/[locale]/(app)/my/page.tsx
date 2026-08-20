import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStudentProfile } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { creditsRemaining } from "@/lib/booking";
import { formatDate, formatDateTime } from "@/lib/dates";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { CancelBookingButton } from "../book/book-button";
import { BookingQr } from "@/components/app/booking-qr";
import { PushToggle } from "@/components/app/push-toggle";
import { Card as PushCard, CardBody as PushCardBody } from "@/components/ui/card";

export default async function MyClassesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { user, profile } = await requireStudentProfile();

  const studio = user.studio;
  const t = await getTranslations("booking");
  const ts = await getTranslations("students");
  const tq = await getTranslations("checkin");
  const tpush = await getTranslations("push");

  const now = new Date();
  const studentId = profile.id;

  const [upcoming, past, packs, credits] = await Promise.all([
    db.booking.findMany({
      where: {
        studentId,
        status: { in: ["BOOKED", "ATTENDED"] },
        classInstance: { startsAt: { gt: now } },
      },
      include: { classInstance: { include: { instructor: { include: { user: true } } } } },
      orderBy: { classInstance: { startsAt: "asc" } },
    }),
    db.booking.findMany({
      where: {
        studentId,
        classInstance: { startsAt: { lte: now } },
        status: { in: ["ATTENDED", "NO_SHOW", "BOOKED"] },

      },
      include: { classInstance: true },
      orderBy: { classInstance: { startsAt: "desc" } },
      take: 15,
    }),
    db.studentPack.findMany({
      where: { studentId, status: "ACTIVE", expiresAt: { gt: now } },
      include: { pack: true },
      orderBy: { expiresAt: "asc" },
    }),
    creditsRemaining(studentId),
  ]);

  const cutoffMs = studio.cancellationCutoffHours * 3_600_000;

  return (
    <>
      <PageHeader
        title={t("myClasses")}
        description={credits === null ? t("creditsUnlimited") : t("creditsLeft", { count: credits })}
        action={
          <Link href="/book" className={buttonClass("primary", "sm")}>
            {t("book")}
          </Link>
        }
      />

      {/* Opt-in lives here because this is the screen students actually open. */}
      <PushCard className="mb-4">
        <PushCardBody className="space-y-2">
          <p className="text-sm font-medium text-ink">{tpush("title")}</p>
          <p className="text-xs text-muted">{tpush("hint")}</p>
          <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
        </PushCardBody>
      </PushCard>

      {packs.length > 0 && (
        <Card className="mb-4">
          <CardHeader title={ts("activePacks")} />
          <ul className="divide-y divide-line">
            {packs.map((pack) => (
              <li
                key={pack.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
              >
                <div>
                  <p className="text-sm font-medium">{pack.pack.name}</p>
                  <p className="text-xs text-muted">
                    {ts("expiresOn", {
                      date: formatDate(pack.expiresAt, studio.timezone, locale),
                    })}
                  </p>
                </div>
                <Badge tone="accent">
                  {pack.isUnlimited
                    ? ts("unlimited")
                    : ts("credits", { used: pack.creditsUsed, total: pack.creditsTotal })}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader title={t("upcoming")} />
        {upcoming.length === 0 ? (
          <EmptyState
            message={t("noUpcoming")}
            action={
              <Link href="/book" className={buttonClass("primary", "sm")}>
                {t("book")}
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {upcoming.map((booking) => {
              const isLate =
                booking.classInstance.startsAt.getTime() - now.getTime() < cutoffMs;

              return (
                <li key={booking.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-10 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: booking.classInstance.colorHex }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-ink">{booking.classInstance.name}</p>
                      <p className="truncate text-xs text-muted">
                        {formatDateTime(booking.classInstance.startsAt, studio.timezone, locale)}
                        {booking.classInstance.instructor
                          ? ` · ${booking.classInstance.instructor.user.name}`
                          : ""}
                      </p>
                    </div>
                    {booking.status === "ATTENDED" ? (
                      <Badge tone="positive">{t("attended")}</Badge>
                    ) : (
                      <CancelBookingButton
                        bookingId={booking.id}
                        lateWarningHours={studio.cancellationCutoffHours}
                        isLate={isLate}
                      />
                    )}
                  </div>
                  {/* The code opens under the row so it never squeezes the text. */}
                  <div className="mt-1 pl-4">
                    <BookingQr token={booking.checkInToken} label={tq("myCode")} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title={t("past")} />
        {past.length === 0 ? (
          <EmptyState message={t("noPast")} />
        ) : (
          <ul className="divide-y divide-line">
            {past.map((booking) => (
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
                {booking.status === "ATTENDED" && <Badge tone="positive">{t("attended")}</Badge>}
                {booking.status === "NO_SHOW" && <Badge tone="critical">{t("noShow")}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
