import "server-only";
import { db } from "@/lib/db";
import { notifyPreferred, notifyOwners } from "@/lib/notifications";
import { sweepExpiredOffers } from "@/lib/waitlist";
import { isBirthdayToday, startOfDayInZone, ageFrom } from "@/lib/dates";

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
  let birthdays = 0;

  for (const studio of studios) {
    // Offers that ran out get passed along on the same schedule.
    await sweepExpiredOffers(studio, now);

    birthdays += await sendBirthdayNotices(studio, now);

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

  return { studios: studios.length, classes, sent, birthdays };
}

type BirthdayStudio = { id: string; name: string; timezone: string; locale: string };

/**
 * Tells the studio whose birthday it is, so someone can offer them a class on
 * the house before the day is over.
 *
 * The guard is the notification log rather than a column: one notice per
 * student per day, which is what "already told them" actually means, and it
 * survives the job running every fifteen minutes.
 */
async function sendBirthdayNotices(studio: BirthdayStudio, now: Date): Promise<number> {
  const students = await db.studentProfile.findMany({
    where: { user: { studioId: studio.id, isActive: true }, birthDate: { not: null } },
    include: { user: true },
  });

  const todays = students.filter(
    (student) => student.birthDate && isBirthdayToday(student.birthDate, studio.timezone, now),
  );
  if (todays.length === 0) return 0;

  const since = startOfDayInZone(now, studio.timezone);
  const alreadyTold = await db.notificationLog.findMany({
    where: {
      studioId: studio.id,
      template: "student_birthday",
      relatedId: { in: todays.map((student) => student.id) },
      createdAt: { gte: since },
    },
    select: { relatedId: true },
  });
  const told = new Set(alreadyTold.map((row) => row.relatedId));

  let count = 0;
  for (const student of todays) {
    if (told.has(student.id)) continue;

    const age = ageFrom(student.birthDate!, now);

    await notifyOwners(studio.id, {
      url: "/students",
      template: "student_birthday",
      subject: `${studio.name} — cumpleaños`,
      body:
        studio.locale === "en"
          ? `${student.user.name} turns ${age} today. Add them to a class without using a credit — tick "don't use a credit" when you add them.`
          : `${student.user.name} cumple ${age} hoy. Podés sumarla a una clase sin gastarle crédito — marcá "sin gastar crédito" al agregarla.`,
      relatedType: "StudentProfile",
      relatedId: student.id,
    });
    count++;
  }

  return count;
}
