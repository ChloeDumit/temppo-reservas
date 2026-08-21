import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireStudentProfile } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { creditsRemaining } from "@/lib/booking";
import { makeupBalance } from "@/lib/makeups";
import { formatDate, formatDateTime, formatTime } from "@/lib/dates";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/page-header";
import { RingMeter } from "@/components/ui/meter";
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

  const [upcoming, past, packs, credits, makeups] = await Promise.all([
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
    // Only meaningful for a student on a fixed spot; a pack student sees zeroes.
    makeupBalance(studentId, studio),
  ]);

  const cutoffMs = studio.cancellationCutoffHours * 3_600_000;

  // The swap allowance only applies to a student the studio has put on a
  // standing weekly spot; everyone else pays per class out of a pack.
  const hasFixedSpot =
    (await db.recurringBooking.count({
      where: { studentId, status: { in: ["ACTIVE", "PAUSED"] } },
    })) > 0;

  // The hero shows the soonest booking; the list below keeps the full picture.
  const nextBooking = upcoming[0] ?? null;
  const packTotal = packs.reduce((sum, p) => sum + (p.isUnlimited ? 0 : p.creditsTotal), 0);

  return (
    <>
      {/*
        One question first: when is my next class. Everything else — credits,
        notifications, history — sits underneath it.
      */}
      <section className="card-feature mb-4 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-ink/60">
              {t("nextClassHero")}
            </p>
            <h1 className="mt-1 text-[26px] leading-tight text-ink sm:text-3xl">{t("myClasses")}</h1>
          </div>

          {/*
            Credits as a ring that drains: a full ring means a full pack, and
            it empties as classes are used. Showing classes *used* instead
            would read as "none left" on a brand new pack.
          */}
          {credits !== null && packTotal > 0 && (
            <span className="flex shrink-0 flex-col items-center">
              <RingMeter
                filled={credits}
                total={packTotal}
                size={54}
                label={t("creditsLeft", { count: credits })}
              />
              <span className="mt-1 text-[10px] uppercase tracking-wider text-accent-ink/60">
                {t("creditsRing")}
              </span>
            </span>
          )}
          {credits === null && (
            <span className="shrink-0 rounded-[var(--radius-pill)] bg-accent px-3 py-1.5 text-xs font-semibold text-white">
              {t("creditsUnlimited")}
            </span>
          )}
        </div>

        {nextBooking ? (
          <div className="mt-4 rounded-[var(--radius-lg)] bg-surface px-4 py-4 shadow-soft">
            <div className="flex items-start gap-3">
              <span
                className="h-11 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: nextBooking.classInstance.colorHex }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-2xl font-semibold tabular-nums text-ink">
                    {formatTime(nextBooking.classInstance.startsAt, studio.timezone, locale)}
                  </span>
                  <span className="truncate text-[15px] text-ink">
                    {nextBooking.classInstance.name}
                  </span>
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {formatDate(nextBooking.classInstance.startsAt, studio.timezone, locale)}
                  {nextBooking.classInstance.instructor
                    ? ` · ${nextBooking.classInstance.instructor.user.name}`
                    : ""}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-[var(--radius-lg)] bg-surface px-4 py-5 text-center shadow-soft">
            <p className="text-sm text-muted">{t("noneUpcomingCalm")}</p>
            <Link href="/book" className={buttonClass("primary", "sm", "mt-3")}>
              {t("bookFirst")}
            </Link>
          </div>
        )}
      </section>
      {/*
        Only for students who actually hold a fixed spot. A pack student has no
        swap allowance, and the card would only confuse them.
      */}
      {hasFixedSpot && makeups.allowance > 0 && (
        <Card className="mb-4">
          <CardHeader title={t("makeupsTitle")} />
          <div className="space-y-1.5 px-4 py-4 sm:px-5">
            <p className="text-sm text-ink">
              {makeups.available === 0
                ? t("makeupsNone")
                : makeups.available === 1
                  ? t("makeupsAvailable", { count: 1 })
                  : t("makeupsAvailablePlural", { count: makeups.available })}
            </p>
            <p className="text-xs text-muted">
              {makeups.changesLeft === 0
                ? t("changesNone")
                : makeups.changesLeft === 1
                  ? t("changesLeftOne")
                  : t("changesLeft", { count: makeups.changesLeft })}
              {makeups.available > 0 ? ` ${t("makeupsExpire")}` : ""}
            </p>
          </div>
        </Card>
      )}

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

      {/* Sits below the daily question — useful, but not why they opened the app. */}
      <PushCard className="mb-4">
        <PushCardBody className="space-y-2">
          <p className="text-sm font-medium text-ink">{tpush("title")}</p>
          <p className="text-xs text-muted">{tpush("hint")}</p>
          <PushToggle publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
        </PushCardBody>
      </PushCard>
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
