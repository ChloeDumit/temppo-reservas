import "server-only";
import { db } from "@/lib/db";
import { notifyPreferred } from "@/lib/notifications";
import { sweepExpiredOffers } from "@/lib/waitlist";

/**
 * Sends the pre-class reminder for every studio whose window has arrived.
 *
 * A class is reminded once — `remindersSentAt` is the guard, so running this
 * more often than needed is harmless.
 */
export async function sendDueReminders(now = new Date()) {
  const studios = await db.studio.findMany({
    where: { users: { some: {} } },
  });

  let sent = 0;
  let classes = 0;

  for (const studio of studios) {
    // Offers that ran out get passed along on the same schedule.
    await sweepExpiredOffers(studio, now);

    const windowEnd = new Date(now.getTime() + studio.reminderHoursBefore * 3_600_000);

    const due = await db.classInstance.findMany({
      where: {
        studioId: studio.id,
        status: "SCHEDULED",
        remindersSentAt: null,
        startsAt: { gt: now, lte: windowEnd },
      },
      include: {
        instructor: { include: { user: true } },
        location: true,
        bookings: {
          where: { status: "BOOKED" },
          include: { student: { include: { user: true } } },
        },
      },
    });

    for (const klass of due) {
      const when = new Intl.DateTimeFormat(studio.locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: studio.timezone,
      }).format(klass.startsAt);

      for (const booking of klass.bookings) {
        const student = booking.student.user;
        const body =
          studio.locale === "en"
            ? `Hi ${student.name}, reminder: ${klass.name} on ${when}${klass.location ? ` at ${klass.location.name}` : ""}. See you there!`
            : `Hola ${student.name}, te recordamos tu clase de ${klass.name} el ${when}${klass.location ? ` en ${klass.location.name}` : ""}. ¡Te esperamos!`;

        await notifyPreferred({
          studioId: studio.id,
          to: student.email,
          phone: student.phone,
          userId: student.id,
          url: "/my",
          template: "class_reminder",
          subject: `${studio.name} — ${klass.name}`,
          body,
          relatedType: "Booking",
          relatedId: booking.id,
        });
        sent++;
      }

      // Marked even with zero attendees, so an empty class isn't rechecked.
      await db.classInstance.update({
        where: { id: klass.id },
        data: { remindersSentAt: now },
      });
      classes++;
    }
  }

  return { studios: studios.length, classes, sent };
}
