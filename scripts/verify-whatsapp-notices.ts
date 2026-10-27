/**
 * Every message a client gets by email also goes by WhatsApp when the studio
 * has it on — including to clients who only gave a phone.
 * Run with: npx tsx scripts/verify-whatsapp-notices.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never;

// Keep the dev email echo out of the output.
console.info = () => {};

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

let passed = 0;
let failed = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
}

async function main() {
  const { WHATSAPP_TEMPLATES, WHATSAPP_TEMPLATE_KEYS, renderWhatsAppTemplate } = await import(
    "../src/lib/notifications/whatsapp-templates"
  );

  console.log("\nPlantillas");
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    const tpl = WHATSAPP_TEMPLATES[key];
    for (const lang of ["es", "en"] as const) {
      const body = tpl.body[lang];
      // Meta: variables in order, not at the start or the end, body ≤ 1024.
      const vars = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      const ok =
        JSON.stringify(vars) === JSON.stringify(tpl.params.map((_, i) => i + 1)) &&
        !/^\s*\{\{/.test(body) &&
        !/\}\}\s*[.!?]?\s*$/.test(body) &&
        body.length <= 1024;
      check(`${key} [${lang}] is one Meta accepts`, ok, true);
    }
  }
  check(
    "rendered as she reads it",
    renderWhatsAppTemplate("appointment_reminder", "es", ["Ana", "Uñas", "Lu", "jueves, 15:00"]),
    "Hola Ana, te recordamos tu turno de Uñas en Lu: jueves, 15:00. ¡Te esperamos!",
  );

  const { notifyBooked, afterDepositSettled, notifyClientChanged } = await import("../src/lib/appointments/notify");
  const { expireHolds } = await import("../src/lib/appointments/cron");
  const { notifyWhatsApp } = await import("../src/lib/notifications/whatsapp");

  await db.studio.deleteMany({ where: { slug: "verify-wa-notices" } });
  const studio = await db.studio.create({
    data: {
      name: "Lu Nails",
      slug: "verify-wa-notices",
      vertical: "APPOINTMENTS",
      brand: "beauty",
      waMode: "LINK",
      waMonthlyQuota: 20,
    },
  });
  const pro = await db.user.create({ data: { studioId: studio.id, email: "pro@wa.test", name: "Lucía", role: "OWNER" } });
  const client = await db.user.create({
    data: { studioId: studio.id, name: "Sofía Pérez", email: null, phone: "099 111 222", role: "STUDENT", studentProfile: { create: {} } },
    include: { studentProfile: true },
  });
  let n = 0;
  const appt = (data: Record<string, unknown> = {}) => {
    const startsAt = new Date(Date.now() + (3 + n) * 86_400_000);
    return db.appointment.create({
      data: {
        studioId: studio.id,
        staffId: pro.id,
        clientId: client.studentProfile!.id,
        serviceName: "Kapping",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
        blockedUntil: new Date(startsAt.getTime() + 3_600_000),
        priceCents: 100000,
        manageTokenHash: `wa-${n++}-${Date.now()}`,
        ...data,
      },
    });
  };

  process.env.WHATSAPP_TOKEN = "test-token";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
  const realFetch = globalThis.fetch;
  const sent: { to: string; template: string; params: string[] }[] = [];
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    if (!String(url).includes("graph.facebook.com")) return realFetch(url, init);
    const body = JSON.parse(String(init?.body));
    sent.push({
      to: body.to,
      template: body.template.name,
      params: body.template.components[0].parameters.map((p: { text: string }) => p.text),
    });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${sent.length}` }] }), { status: 200 });
  }) as typeof fetch;
  const last = () => sent[sent.length - 1];

  try {
    console.log("\nSin WhatsApp automático");
    const a0 = await appt();
    await notifyBooked(a0.id, "tok0");
    await notifyClientChanged(a0.id, "cancelled");
    check("a studio on the manual button sends nothing", sent.length, 0);

    await db.studio.update({ where: { id: studio.id }, data: { waMode: "CLOUD" } });

    console.log("\nCon WhatsApp automático, clienta sin email");
    const a1 = await appt();
    await notifyBooked(a1.id, "tok1");
    check("booked: confirmation with her link", [last()?.template, last()?.to, last()?.params[0], last()?.params[4].endsWith("/m/tok1")], [
      "appointment_booked",
      "59899111222",
      "Sofía",
      true,
    ]);

    const a2 = await appt({ status: "PENDING_PAYMENT", depositCents: 30000, depositStatus: "PENDING", holdExpiresAt: new Date(Date.now() + 600_000) });
    await notifyBooked(a2.id, "tok2");
    check("booked with deposit pending: held", last()?.template, "appointment_held");

    await db.appointment.update({ where: { id: a2.id }, data: { status: "CONFIRMED", depositStatus: "PAID" } });
    await afterDepositSettled(a2.id, "confirmed", "test");
    check("deposit in: confirmed, with the amount", [last()?.template, last()?.params[1].includes("300")], ["appointment_confirmed", true]);

    await afterDepositSettled(a2.id, "paid_too_late", "test");
    check("deposit too late: told", last()?.template, "appointment_deposit_late");

    await notifyClientChanged(a1.id, "moved");
    check("moved by the studio, with who", [last()?.template, last()?.params[4]], ["appointment_moved", "Lucía"]);
    await notifyClientChanged(a1.id, "cancelled");
    check("cancelled by the studio", last()?.template, "appointment_cancelled");

    const a3 = await appt({ status: "PENDING_PAYMENT", depositCents: 30000, depositStatus: "PENDING", holdExpiresAt: new Date(Date.now() - 60_000) });
    await expireHolds({ ...studio, waMode: "CLOUD", reminderHoursBefore: 24 }, new Date());
    check("hold ran out: told, with where to book again", [last()?.template, last()?.params[4].endsWith("/b/verify-wa-notices")], [
      "appointment_expired",
      true,
    ]);
    check("it really expired", (await db.appointment.findUniqueOrThrow({ where: { id: a3.id } })).status, "EXPIRED");

    console.log("\nCupo y errores");
    const used = (await db.studio.findUniqueOrThrow({ where: { id: studio.id } })).waSentThisPeriod;
    check("each message took one from the quota", used, sent.length);
    const wrong = await notifyWhatsApp({ studioId: studio.id, phone: "099111222", template: "appointment_reminder", language: "es", params: ["solo uno"] });
    check("wrong number of variables is refused before spending", [wrong, (await db.studio.findUniqueOrThrow({ where: { id: studio.id } })).waSentThisPeriod], [false, used]);
    for (const m of sent) {
      check(`${m.template} filled every variable`, m.params.every((p) => p.trim().length > 0), true);
    }
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    await db.studio.deleteMany({ where: { slug: "verify-wa-notices" } });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});
