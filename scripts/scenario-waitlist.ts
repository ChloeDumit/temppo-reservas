/**
 * Sets up a waitlist scenario you can drive by hand to test notifications.
 *
 *   npm run scenario:waitlist
 *
 * Creates a class with a single seat, books one student into it, and puts
 * another on the waitlist. Cancelling the booked student then triggers the
 * real offer path: push, then WhatsApp, then email.
 *
 * Safe to re-run — it resets its own class each time and touches nothing else.
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const so = req.resolve("server-only");
req.cache[so] = { id: so, filename: so, loaded: true, exports: {} } as never;

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const CLASS_NAME = "Prueba lista de espera";
const BOOKED_EMAIL = "belen@example.com";
const WAITING_EMAIL = "ana@example.com";

async function main() {
  const studio = await db.studio.findUnique({ where: { slug: "estudio-anima" } });
  if (!studio) {
    console.error("Demo studio not found. Run `npm run seed` first.");
    process.exit(1);
  }

  // Start clean so the scenario is identical every run.
  await db.classInstance.deleteMany({ where: { studioId: studio.id, name: CLASS_NAME } });

  const student = async (email: string) => {
    const user = await db.user.findUnique({
      where: { email },
      include: { studentProfile: true },
    });
    if (!user?.studentProfile) {
      console.error(`Missing demo student ${email}. Run \`npm run seed\` first.`);
      process.exit(1);
    }
    return { profile: user.studentProfile, user };
  };

  const booked = await student(BOOKED_EMAIL);
  const waiting = await student(WAITING_EMAIL);

  // Two days out: comfortably past the cancellation cutoff, so cancelling is
  // a clean in-window cancellation rather than a late one.
  const startsAt = new Date(Date.now() + 48 * 3_600_000);

  const location = await db.location.findFirst({ where: { studioId: studio.id } });
  const instructor = await db.instructorProfile.findFirst({
    where: { user: { studioId: studio.id } },
  });

  const klass = await db.classInstance.create({
    data: {
      studioId: studio.id,
      name: CLASS_NAME,
      colorHex: "#C0563C",
      // One seat, so a single cancellation frees the class outright.
      capacity: 1,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 55 * 60_000),
      locationId: location?.id ?? null,
      instructorId: instructor?.id ?? null,
    },
  });

  await db.booking.create({
    data: {
      studioId: studio.id,
      classInstanceId: klass.id,
      studentId: booked.profile.id,
      source: "ADMIN",
      status: "BOOKED",
    },
  });

  await db.waitlistEntry.create({
    data: {
      studioId: studio.id,
      classInstanceId: klass.id,
      studentId: waiting.profile.id,
      position: 1,
      status: "WAITING",
    },
  });

  const when = new Intl.DateTimeFormat("es-UY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: studio.timezone,
  }).format(startsAt);

  console.log(`
  Waitlist scenario ready
  ───────────────────────────────────────────────

  Class     ${CLASS_NAME}
  When      ${when}
  Capacity  1 seat — full

  Seat held by   ${booked.user.name}  (${BOOKED_EMAIL})
  Waiting        ${waiting.user.name}  (${WAITING_EMAIL})

  How to test the notification
  ───────────────────────────────────────────────

  1. On your PHONE, open the app and sign in as:
         ${WAITING_EMAIL} / demo1234
     Go to "Mis clases" and turn notifications ON.
     On iPhone this only works from the home-screen app, not Safari.

  2. On your LAPTOP, sign in as owner@anima.uy / demo1234.
     Go to Agenda, open "${CLASS_NAME}", and remove ${booked.user.name}
     from the attendee list.

  3. ${waiting.user.name}'s phone gets the offer with a 15-minute claim link.
     The same message is echoed in the dev server console.

  4. Tapping the link books the seat and the waitlist entry becomes CLAIMED.
     Ignore it for 15 minutes instead and the offer expires, passing the
     spot to whoever is next.

  Re-run this script to reset the scenario.
`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
