/**
 * Charging Temppo Beauty studios: the plan after the trial, prices, the
 * reminders, a Mercado Pago payment arriving (no real charge: the webhook's
 * part is called directly), extra WhatsApp messages, changing plans and the
 * console's manual payment.
 * Run with: npx tsx scripts/verify-beauty-billing.ts
 */
import "dotenv/config";
import { createRequire } from "node:module";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const req = createRequire(import.meta.url);
const serverOnlyPath = req.resolve("server-only");
req.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} } as never;

// Nothing reaches a phone or an inbox from a test.
delete process.env.VAPID_PRIVATE_KEY;
delete process.env.EMAIL_SEND_IN_DEV;

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let passed = 0;
let failed = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
  ok ? passed++ : failed++;
}

const SLUG = "verify-billing-";
const DAY = 86_400_000;

async function main() {
  const rules = await import("../src/lib/billing/beauty");
  const server = await import("../src/lib/billing/beauty-server");
  const { claimWhatsAppMessage } = await import("../src/lib/notifications/whatsapp");
  const { parsePaymentRef } = await import("../src/lib/payments/reference");
  const { addMonths } = await import("../src/lib/dates");

  const now = new Date();
  const at = (days: number) => new Date(now.getTime() + days * DAY);

  console.log("\nLas reglas");
  check("after the trial, one professional: Independiente", rules.defaultPlanAfterTrial(1), "ESSENTIAL");
  check("more than one: Equipo", rules.defaultPlanAfterTrial(3), "STUDIO");
  check("a plan she chose wins", rules.planToBill({ plan: "TRIAL", nextPlan: "NETWORK" }, 1), "NETWORK");
  check("launch and regular price", [rules.beautyPriceCents("STUDIO", true), rules.beautyPriceCents("STUDIO", false)], [89_000, 139_000]);
  check("bigger is an upgrade, smaller is not", [rules.isUpgrade("ESSENTIAL", "STUDIO"), rules.isUpgrade("NETWORK", "STUDIO"), rules.isUpgrade("TRIAL", "NETWORK")], [true, false, false]);
  check("three professionals do not fit Independiente", rules.planLimitProblem("ESSENTIAL", { professionals: 3, locations: 1 })?.startsWith("Tenés 3 profesionales"), true);
  check("but fit Equipo", rules.planLimitProblem("STUDIO", { professionals: 3, locations: 1 }), null);
  check("a charge reference is understood", parsePaymentRef("charge:abc"), { kind: "charge", id: "abc" });

  const trialEnding = (days: number, sent = 0, remindedFor: Date | null = null) =>
    rules.reminderDue(
      { plan: "TRIAL", nextPlan: null, trialEndsAt: at(days), suspendedAt: null, billingRemindedFor: remindedFor, billingReminderStage: sent },
      null,
      now,
      new Date(0),
    )?.stage ?? null;
  check("four days before: nothing yet", trialEnding(4), null);
  check("three days before: the first reminder", trialEnding(2.9), 1);
  check("on the day: the second", trialEnding(-0.1), 2);
  check("three days late: the third", trialEnding(-3.1), 3);
  check("found five days late: only the late one", trialEnding(-5), 3);
  const due = at(2);
  check(
    "never twice for the same date",
    rules.reminderDue({ plan: "TRIAL", nextPlan: null, trialEndsAt: due, suspendedAt: null, billingRemindedFor: due, billingReminderStage: 1 }, null, now),
    null,
  );
  check(
    "a date gone before reminders began gets nothing",
    rules.reminderDue(
      { plan: "TRIAL", nextPlan: null, trialEndsAt: new Date("2026-11-08T12:00:00Z"), suspendedAt: null, billingRemindedFor: null, billingReminderStage: 0 },
      null,
      new Date("2026-11-12T12:00:00Z"),
    ),
    null,
  );
  check(
    "nothing on auto-debit, nothing suspended",
    [
      rules.reminderDue({ plan: "STUDIO", nextPlan: null, trialEndsAt: null, suspendedAt: null, billingRemindedFor: null, billingReminderStage: 0 }, { status: "ACTIVE", provider: "mercadopago", currentPeriodEnd: at(1) }, now),
      rules.reminderDue({ plan: "TRIAL", nextPlan: null, trialEndsAt: at(1), suspendedAt: now, billingRemindedFor: null, billingReminderStage: 0 }, null, now),
    ],
    [null, null],
  );

  await db.studio.deleteMany({ where: { slug: { startsWith: SLUG } } });
  const studio = await db.studio.create({
    data: { name: "Uñas de Prueba", slug: `${SLUG}a`, brand: "beauty", vertical: "APPOINTMENTS", plan: "TRIAL", trialEndsAt: at(2), waMode: "CLOUD", waMonthlyQuota: 50 },
  });
  const owner = await db.user.create({ data: { studioId: studio.id, email: "duena@verify-billing.test", name: "Vale Prueba", role: "OWNER" } });
  const launch = await server.launchPriceApplies(studio, now);

  try {
    console.log("\nRecordatorios");
    const sent = await server.sendBillingReminders(now);
    const logs = await db.notificationLog.findMany({ where: { studioId: studio.id, template: "billing_reminder_1" } });
    check("the owner gets the first reminder", [sent >= 1, logs.map((l) => l.recipient)], [true, ["duena@verify-billing.test"]]);
    check("and not again on the next sweep", await db.notificationLog.count({ where: { studioId: studio.id, template: { startsWith: "billing_reminder" } } }), 1);
    await server.sendBillingReminders(now);
    check("still one", await db.notificationLog.count({ where: { studioId: studio.id, template: { startsWith: "billing_reminder" } } }), 1);
    const message = await server.billingMessage(studio.id, 1, now);
    check("one professional: the reminder quotes Independiente", message.text.includes(`plan Independiente cuesta $${rules.beautyPriceCents("ESSENTIAL", launch) / 100}`), true);
    check("and links to Mi plan", message.text.includes("/plan"), true);

    console.log("\nElegir plan");
    check("during the trial, a choice is for afterwards", await server.choosePlan(studio.id, "STUDIO", { id: owner.id, name: owner.name }), { ok: true, applied: "next" });
    check("saved as the next plan", (await db.studio.findUniqueOrThrow({ where: { id: studio.id } })).nextPlan, "STUDIO");

    console.log("\nPago con Mercado Pago");
    const sub = await db.subscription.create({ data: { studioId: studio.id, plan: "STUDIO", status: "PENDING", amountCents: 0 } });
    const amount = rules.beautyPriceCents("STUDIO", launch);
    const charge = await db.subscriptionCharge.create({
      data: { subscriptionId: sub.id, studioId: studio.id, amountCents: amount, method: "MERCADO_PAGO", status: "PENDING", purpose: "PLAN", plan: "STUDIO", months: 1 },
    });
    check("a different amount is not credited", await server.settlePlatformCharge({ chargeId: charge.id, providerPaymentId: "mp-1", status: "APPROVED", amountCents: amount + 100, now }), "mismatch");
    check("the right one is", await server.settlePlatformCharge({ chargeId: charge.id, providerPaymentId: "mp-1", status: "APPROVED", amountCents: amount, now }), "paid");
    const paid = await db.studio.findUniqueOrThrow({ where: { id: studio.id }, include: { subscription: true } });
    check("she is on Equipo, with its WhatsApp", [paid.plan, paid.nextPlan, paid.waMonthlyQuota], ["STUDIO", null, 300]);
    check(
      "her month starts when the trial ends, not today",
      paid.subscription?.currentPeriodEnd?.toISOString(),
      addMonths(studio.trialEndsAt!, 1).toISOString(),
    );
    check("the launch price is kept for a year", Boolean(paid.launchPriceUntil) === launch, true);
    check("a retried webhook changes nothing", await server.settlePlatformCharge({ chargeId: charge.id, providerPaymentId: "mp-1", status: "APPROVED", amountCents: amount, now }), "duplicate");

    console.log("\nMensajes extra de WhatsApp");
    const pack = await db.subscriptionCharge.create({
      data: { subscriptionId: sub.id, studioId: studio.id, amountCents: rules.WA_PACK_CENTS, method: "MERCADO_PAGO", status: "PENDING", purpose: "WA_PACK", months: 0 },
    });
    await server.settlePlatformCharge({ chargeId: pack.id, providerPaymentId: "mp-2", status: "APPROVED", amountCents: rules.WA_PACK_CENTS, now });
    check("200 messages added", (await db.studio.findUniqueOrThrow({ where: { id: studio.id } })).waExtraCredits, 200);
    await db.studio.update({ where: { id: studio.id }, data: { waSentThisPeriod: 300, waPeriodStart: now } });
    check("the month spent: the extra ones are used", await claimWhatsAppMessage(studio.id, now), "extra");
    check("one fewer", (await db.studio.findUniqueOrThrow({ where: { id: studio.id } })).waExtraCredits, 199);
    await db.studio.update({ where: { id: studio.id }, data: { waSentThisPeriod: 10 } });
    check("while the month lasts, those come first", await claimWhatsAppMessage(studio.id, now), "month");

    console.log("\nCambiar de plan");
    check("bigger: at once", await server.choosePlan(studio.id, "NETWORK", { id: owner.id, name: owner.name }), { ok: true, applied: "now" });
    const up = await db.studio.findUniqueOrThrow({ where: { id: studio.id }, include: { subscription: true } });
    check("on Salón now, at Salón's price", [up.plan, up.waMonthlyQuota, up.subscription?.amountCents], ["NETWORK", 800, rules.beautyPriceCents("NETWORK", launch)]);
    check("smaller: from the next payment", await server.choosePlan(studio.id, "ESSENTIAL", { id: owner.id, name: owner.name }), { ok: true, applied: "next" });
    check("still Salón until then", [(await db.studio.findUniqueOrThrow({ where: { id: studio.id } })).plan, (await db.studio.findUniqueOrThrow({ where: { id: studio.id } })).nextPlan], ["NETWORK", "ESSENTIAL"]);
    await db.user.createMany({
      data: [1, 2].map((i) => ({ studioId: studio.id, email: `pro${i}@verify-billing.test`, name: `Pro ${i}`, role: "INSTRUCTOR" as const })),
    });
    check("with three professionals, Independiente is refused", "error" in (await server.choosePlan(studio.id, "ESSENTIAL", { id: owner.id, name: owner.name })), true);

    console.log("\nPago manual desde la consola");
    const before = (await db.subscription.findUniqueOrThrow({ where: { studioId: studio.id } })).currentPeriodEnd!;
    const charged = await server.recordManualBeautyCharge({ studioId: studio.id, plan: "STUDIO", months: 2, amountCents: null, note: "BROU", recordedById: owner.id });
    const after = await db.studio.findUniqueOrThrow({ where: { id: studio.id }, include: { subscription: true } });
    check("two months at the plan's price", charged, rules.beautyPriceCents("STUDIO", launch) * 2);
    check("paid through two more months, on the plan paid for", [after.subscription?.currentPeriodEnd?.toISOString(), after.plan], [addMonths(before, 2).toISOString(), "STUDIO"]);

    console.log("\nDatos para transferir");
    const previous = await db.platformSetting.findUnique({ where: { key: "billing.transfer" } });
    await server.saveTransferDetails({ bank: "BROU", accountType: "Caja de ahorro", accountNumber: "001-123", holder: "Temppo", whatsapp: "+59899000000", note: "" }, owner.id);
    const withTransfer = await server.billingMessage(studio.id, 2, now);
    check("the message carries the account and where to send the receipt", [withTransfer.text.includes("Cuenta: 001-123"), withTransfer.text.includes("wa.me/59899000000")], [true, true]);
    if (previous) await db.platformSetting.update({ where: { key: previous.key }, data: { value: previous.value as object } });
    else await db.platformSetting.delete({ where: { key: "billing.transfer" } });
  } finally {
    await db.notificationLog.deleteMany({ where: { studioId: studio.id } });
    await db.studio.deleteMany({ where: { slug: { startsWith: SLUG } } });
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
