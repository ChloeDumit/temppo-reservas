import "server-only";
import { db } from "@/lib/db";
import type { Plan } from "@/generated/prisma/enums";
import { addMonths } from "@/lib/dates";
import { appUrlFor } from "@/lib/brand/url";
import { brandByKey } from "@/lib/brand/registry";
import { LAUNCH_LOCK_MONTHS, LAUNCH_SPOTS, WA_PACK } from "@/lib/brand/pricing";
import { localePath } from "@/i18n/routing";
import { paymentProvider } from "@/lib/payments";
import { notifyPlatformAdmins, notifyPreferred } from "@/lib/notifications";
import { pushToUser } from "@/lib/notifications/push";
import { recordAudit } from "@/lib/audit";
import { extendedPeriodEnd, PLATFORM_CURRENCY, type PaidPlan } from "./plans";
import {
  beautyPlan,
  beautyPriceCents,
  daysLeft,
  dueDate,
  isUpgrade,
  onAutoDebit,
  planLimitProblem,
  planToBill,
  reminderDue,
  WA_PACK_CENTS,
  type ReminderStage,
} from "./beauty";

/*
  Charging Temppo Beauty studios: the monthly plan and extra WhatsApp
  messages, by Mercado Pago into the platform's own account or by transfer
  recorded from the console; changing plans; and the reminders. The rules
  themselves live in ./beauty.ts.
*/

const STAFF_ROLES = ["OWNER", "ADMIN", "INSTRUCTOR"] as const;
const TZ = "America/Montevideo";

/* ----------------------------------------------------- transfer details */

export type TransferDetails = {
  bank: string;
  accountType: string;
  accountNumber: string;
  holder: string;
  /** Where to send the receipt, international format: +59899123456. */
  whatsapp: string;
  note: string;
};

const TRANSFER_KEY = "billing.transfer";

export async function transferDetails(): Promise<TransferDetails | null> {
  const row = await db.platformSetting.findUnique({ where: { key: TRANSFER_KEY } });
  const value = row?.value as Partial<TransferDetails> | undefined;
  if (!value?.accountNumber) return null;
  return {
    bank: value.bank ?? "",
    accountType: value.accountType ?? "",
    accountNumber: value.accountNumber,
    holder: value.holder ?? "",
    whatsapp: value.whatsapp ?? "",
    note: value.note ?? "",
  };
}

export async function saveTransferDetails(details: TransferDetails, adminId: string) {
  await db.platformSetting.upsert({
    where: { key: TRANSFER_KEY },
    create: { key: TRANSFER_KEY, value: details, updatedById: adminId },
    update: { value: details, updatedById: adminId },
  });
}

export function transferText(t: TransferDetails) {
  return [
    `${t.bank}${t.accountType ? ` · ${t.accountType}` : ""}`,
    `Cuenta: ${t.accountNumber}`,
    t.holder ? `A nombre de: ${t.holder}` : "",
    t.note,
  ]
    .filter(Boolean)
    .join("\n");
}

export function receiptLink(t: TransferDetails | null, studioName: string) {
  const digits = t?.whatsapp.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(`Hola, te mando el comprobante del pago de ${studioName}.`)}`;
}

/* --------------------------------------------------------- the summary */

export async function studioUsage(studioId: string) {
  const [professionals, locations] = await Promise.all([
    db.user.count({ where: { studioId, isActive: true, role: { in: [...STAFF_ROLES] } } }),
    db.location.count({ where: { studioId, isActive: true } }),
  ]);
  return { professionals, locations };
}

/**
 * Whether she pays the launch price: once it was locked in, until it runs
 * out; before her first payment, if she is among the first LAUNCH_SPOTS
 * Temppo Beauty studios.
 */
export async function launchPriceApplies(studio: { id: string; createdAt: Date; launchPriceUntil: Date | null }, now = new Date()) {
  if (studio.launchPriceUntil) return studio.launchPriceUntil > now;
  const before = await db.studio.count({ where: { brand: "beauty", createdAt: { lt: studio.createdAt } } });
  return before < LAUNCH_SPOTS;
}

export async function billingSummary(studioId: string, now = new Date()) {
  const studio = await db.studio.findUniqueOrThrow({ where: { id: studioId }, include: { subscription: true } });
  const usage = await studioUsage(studioId);
  const launch = await launchPriceApplies(studio, now);
  const billPlan = planToBill(studio, usage.professionals);
  const dueAt = dueDate(studio, studio.subscription);
  const charges = await db.subscriptionCharge.findMany({
    where: { studioId, status: "APPROVED" },
    orderBy: { paidAt: "desc" },
    take: 12,
  });
  return {
    studio,
    subscription: studio.subscription,
    usage,
    launch,
    current: studio.plan === "TRIAL" ? null : beautyPlan(studio.plan),
    billPlan: beautyPlan(billPlan),
    amountCents: beautyPriceCents(billPlan, launch),
    dueAt,
    daysLeft: dueAt ? daysLeft(dueAt, now) : null,
    autoDebit: onAutoDebit(studio.subscription),
    wa: {
      quota: studio.waMonthlyQuota,
      sent: studio.waSentThisPeriod,
      extra: studio.waExtraCredits,
      renewsAt: studio.waPeriodStart ? addMonths(studio.waPeriodStart, 1) : null,
      on: studio.waMode === "CLOUD",
    },
    charges,
  };
}

/* ------------------------------------------------------ choosing a plan */

export async function choosePlan(
  studioId: string,
  plan: PaidPlan,
  actor: { id: string; name: string },
): Promise<{ ok: true; applied: "now" | "next" } | { error: string }> {
  const studio = await db.studio.findUnique({ where: { id: studioId }, include: { subscription: true } });
  if (!studio || studio.brand !== "beauty") return { error: "No encontramos el negocio." };
  const problem = planLimitProblem(plan, await studioUsage(studioId));
  if (problem) return { error: problem };

  const upgrade = isUpgrade(studio.plan, plan);
  if (upgrade) {
    const launch = await launchPriceApplies(studio);
    await db.$transaction([
      db.studio.update({ where: { id: studioId }, data: { plan, nextPlan: null, waMonthlyQuota: beautyPlan(plan).waQuota } }),
      ...(studio.subscription
        ? [db.subscription.update({ where: { id: studio.subscription.id }, data: { plan, amountCents: beautyPriceCents(plan, launch) } })]
        : []),
    ]);
  } else {
    // During the trial, or a smaller (or the same) plan: from the next payment.
    await db.studio.update({ where: { id: studioId }, data: { nextPlan: plan === studio.plan ? null : plan } });
  }

  await recordAudit({
    studioId,
    actorId: actor.id,
    actorLabel: actor.name,
    action: "billing.plan_chosen",
    entityType: "Studio",
    entityId: studioId,
    metadata: { from: studio.plan, to: plan, applied: upgrade ? "now" : "next" },
  });
  const name = beautyPlan(plan).name;
  await notifyPlatformAdmins(studioId, {
    template: "billing_plan_ops",
    subject: `Cambio de plan — ${studio.name}: ${name}`,
    body: `${studio.name} eligió el plan ${name}${upgrade ? " (vale desde ya)" : studio.plan === "TRIAL" ? " para cuando termine la prueba" : " desde el próximo pago"}.`,
    relatedType: "Studio",
    relatedId: studioId,
  });
  return { ok: true, applied: upgrade ? "now" : "next" };
}

/* ----------------------------------------------- paying by Mercado Pago */

/** What a charge is for, round-tripped through Mercado Pago. */
export const chargeRef = (chargeId: string) => `charge:${chargeId}`;

export async function startPlatformCheckout(params: {
  studioId: string;
  purpose: "PLAN" | "WA_PACK";
  payerEmail: string;
}): Promise<{ redirectUrl: string } | { error: string }> {
  const provider = paymentProvider();
  if (!provider.isConfigured()) return { error: "El pago con Mercado Pago no está disponible: usá transferencia." };

  const summary = await billingSummary(params.studioId);
  const { studio } = summary;
  const plan = summary.billPlan.plan;
  const amountCents = params.purpose === "PLAN" ? summary.amountCents : WA_PACK_CENTS;

  const subscription =
    summary.subscription ??
    (await db.subscription.create({
      data: { studioId: studio.id, plan, status: "PENDING", amountCents: summary.amountCents, currency: PLATFORM_CURRENCY },
    }));
  const charge = await db.subscriptionCharge.create({
    data: {
      subscriptionId: subscription.id,
      studioId: studio.id,
      amountCents,
      currency: PLATFORM_CURRENCY,
      method: "MERCADO_PAGO",
      status: "PENDING",
      provider: provider.name,
      purpose: params.purpose,
      plan: params.purpose === "PLAN" ? plan : null,
      months: params.purpose === "PLAN" ? 1 : 0,
    },
  });

  const base = appUrlFor(studio);
  const page = `${base}${localePath(studio.locale, "/plan")}`;
  const brand = brandByKey(studio.brand).name;
  try {
    const session = await provider.createCheckout({
      studioId: studio.id,
      externalReference: chargeRef(charge.id),
      title:
        params.purpose === "PLAN"
          ? `${brand} — plan ${summary.billPlan.name}, 1 mes (${studio.name})`
          : `${brand} — ${WA_PACK.messages} mensajes de WhatsApp (${studio.name})`,
      amountCents,
      currency: PLATFORM_CURRENCY,
      payerEmail: params.payerEmail,
      successUrl: `${page}?pago=ok`,
      failureUrl: `${page}?pago=error`,
      notificationUrl: `${base}/api/payments/webhook`,
    });
    return { redirectUrl: session.redirectUrl };
  } catch (error) {
    console.error("[billing] checkout failed", error);
    await db.subscriptionCharge.delete({ where: { id: charge.id } }).catch(() => {});
    return { error: "No pudimos abrir Mercado Pago. Probá de nuevo en un rato." };
  }
}

/**
 * Puts a paid plan in place: the plan she paid for, its WhatsApp quota, the
 * month added and the launch price locked in. Shared by Mercado Pago and the
 * console's manual payment.
 */
async function applyPlanPayment(studioId: string, plan: PaidPlan, months: number, amountCents: number, now: Date) {
  const studio = await db.studio.findUniqueOrThrow({ where: { id: studioId }, include: { subscription: true } });
  const launch = await launchPriceApplies(studio, now);
  const subscription =
    studio.subscription ??
    (await db.subscription.create({ data: { studioId, plan, status: "ACTIVE", amountCents, currency: PLATFORM_CURRENCY } }));
  // A trial still running when she pays: the first month starts when it ends.
  const from = studio.plan === "TRIAL" && studio.trialEndsAt && studio.trialEndsAt > now ? studio.trialEndsAt : subscription.currentPeriodEnd;
  await db.$transaction([
    db.subscription.update({
      where: { id: subscription.id },
      data: {
        plan,
        status: "ACTIVE",
        amountCents: beautyPriceCents(plan, launch),
        lastPaymentAt: now,
        currentPeriodEnd: extendedPeriodEnd(from, months, now),
        cancelledAt: null,
      },
    }),
    db.studio.update({
      where: { id: studioId },
      data: {
        plan,
        nextPlan: null,
        waMonthlyQuota: beautyPlan(plan).waQuota,
        ...(launch && !studio.launchPriceUntil ? { launchPriceUntil: addMonths(now, LAUNCH_LOCK_MONTHS) } : {}),
      },
    }),
  ]);
}

export type ChargeOutcome = "paid" | "duplicate" | "mismatch" | "pending" | "unknown";

/** The webhook's part: a Mercado Pago payment for a platform charge. Idempotent. */
export async function settlePlatformCharge(params: {
  chargeId: string;
  providerPaymentId: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "REFUNDED";
  amountCents: number;
  now?: Date;
}): Promise<ChargeOutcome> {
  const now = params.now ?? new Date();
  const charge = await db.subscriptionCharge.findUnique({ where: { id: params.chargeId } });
  if (!charge) return "unknown";
  if (charge.status === "APPROVED") return "duplicate";
  if (params.status !== "APPROVED") {
    if (params.status === "REJECTED") await db.subscriptionCharge.update({ where: { id: charge.id }, data: { status: "REJECTED" } });
    return "pending";
  }
  if (params.amountCents !== charge.amountCents) {
    console.error(`[billing] amount mismatch for charge ${charge.id}: ${params.amountCents} vs ${charge.amountCents}`);
    return "mismatch";
  }

  // The claim: a retried webhook finds it already approved.
  const claimed = await db.subscriptionCharge.updateMany({
    where: { id: charge.id, status: { not: "APPROVED" } },
    data: { status: "APPROVED", providerPaymentId: params.providerPaymentId, paidAt: now },
  });
  if (!claimed.count) return "duplicate";

  if (charge.purpose === "WA_PACK") {
    await db.studio.update({ where: { id: charge.studioId }, data: { waExtraCredits: { increment: WA_PACK.messages } } });
  } else {
    await applyPlanPayment(charge.studioId, (charge.plan ?? "STUDIO") as PaidPlan, charge.months || 1, charge.amountCents, now);
  }

  const studio = await db.studio.findUnique({ where: { id: charge.studioId }, select: { name: true } });
  await notifyPlatformAdmins(charge.studioId, {
    template: "billing_paid_ops",
    subject: `Pago recibido — ${studio?.name ?? ""}`,
    body: `${studio?.name} pagó $${charge.amountCents / 100} por Mercado Pago (${charge.purpose === "WA_PACK" ? `${WA_PACK.messages} mensajes de WhatsApp` : "1 mes del plan"}).`,
    relatedType: "SubscriptionCharge",
    relatedId: charge.id,
  });
  return "paid";
}

/**
 * The console's manual payment (a transfer) for a Beauty studio: recorded as
 * a charge, with the same effects as a paid checkout. Without an amount, the
 * plan's price for those months.
 */
export async function recordManualBeautyCharge(params: {
  studioId: string;
  plan: PaidPlan;
  months: number;
  amountCents: number | null;
  note: string | null;
  recordedById: string;
}) {
  const now = new Date();
  const studio = await db.studio.findUniqueOrThrow({ where: { id: params.studioId }, include: { subscription: true } });
  const amountCents = params.amountCents ?? beautyPriceCents(params.plan, await launchPriceApplies(studio, now)) * params.months;
  const subscription =
    studio.subscription ??
    (await db.subscription.create({
      data: { studioId: studio.id, plan: params.plan, status: "PENDING", amountCents, currency: PLATFORM_CURRENCY },
    }));
  await db.subscriptionCharge.create({
    data: {
      subscriptionId: subscription.id,
      studioId: studio.id,
      amountCents,
      currency: PLATFORM_CURRENCY,
      method: "BANK_TRANSFER",
      status: "APPROVED",
      purpose: "PLAN",
      plan: params.plan,
      months: params.months,
      note: params.note,
      recordedById: params.recordedById,
      paidAt: now,
    },
  });
  await applyPlanPayment(studio.id, params.plan, params.months, amountCents, now);
  return amountCents;
}

/* ------------------------------------------------------------ reminders */

const STAGE_LEAD: Record<ReminderStage, string> = {
  1: "Tu próximo pago vence pronto",
  2: "Hoy vence tu pago",
  3: "Tu pago está vencido",
};

function dayText(d: Date) {
  return d.toLocaleDateString("es-UY", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
}

/** The message a studio gets — also what the console copies for WhatsApp. */
export async function billingMessage(studioId: string, stage: ReminderStage | null, now = new Date()) {
  const s = await billingSummary(studioId, now);
  const transfer = await transferDetails();
  const owner = await db.user.findFirst({ where: { studioId, role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" } });
  const page = `${appUrlFor(s.studio)}${localePath(s.studio.locale, "/plan")}`;
  const trial = s.studio.plan === "TRIAL";
  const when = s.dueAt ? dayText(s.dueAt) : "";
  const amount = `$${(s.amountCents / 100).toLocaleString("es-UY")}`;

  const opening =
    stage === 3
      ? `tu pago de ${brandByKey(s.studio.brand).name} venció el ${when} y todavía no lo registramos.`
      : stage === 2
        ? `hoy, ${when}, ${trial ? "termina tu prueba gratis" : "vence tu pago"} de ${brandByKey(s.studio.brand).name}.`
        : `${trial ? "tu prueba gratis" : "tu mes"} de ${brandByKey(s.studio.brand).name} ${trial ? "termina" : "vence"} el ${when}.`;

  const lines = [
    `Hola ${owner?.name?.split(" ")[0] ?? ""}, ${opening}`,
    "",
    `Para seguir usando tu agenda, el plan ${s.billPlan.name} cuesta ${amount} por mes${s.launch ? " (precio de lanzamiento)" : ""}.`,
    "",
    `💳 Pagá con Mercado Pago o cambiá de plan desde Mi plan: ${page}`,
  ];
  if (transfer) {
    lines.push("", "🏦 O por transferencia:", transferText(transfer));
    const receipt = receiptLink(transfer, s.studio.name);
    if (receipt) lines.push(`Mandanos el comprobante por WhatsApp: ${receipt}`);
  }
  lines.push("", "¿Dudas? Respondé este mensaje.");
  return { summary: s, owner, text: lines.join("\n"), subject: stage ? STAGE_LEAD[stage] : "Tu plan", page };
}

/**
 * The sweep's part. A Temppo Beauty studio gets one reminder per stage per
 * due date, by email and push to the owner; from the due date on, the
 * platform admins are told too, so someone follows it up.
 */
export async function sendBillingReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 3 * 86_400_000);
  const since = new Date(now.getTime() - 31 * 86_400_000);
  const studios = await db.studio.findMany({
    where: {
      brand: "beauty",
      suspendedAt: null,
      OR: [
        { plan: "TRIAL", trialEndsAt: { gte: since, lte: soon } },
        { plan: { not: "TRIAL" }, subscription: { currentPeriodEnd: { gte: since, lte: soon } } },
      ],
    },
    include: { subscription: true },
  });

  let sent = 0;
  for (const studio of studios) {
    const due = reminderDue(studio, studio.subscription, now);
    if (!due) continue;
    const claimed = await db.studio.updateMany({
      where: { id: studio.id, billingRemindedFor: studio.billingRemindedFor, billingReminderStage: studio.billingReminderStage },
      data: { billingRemindedFor: due.dueAt, billingReminderStage: due.stage },
    });
    if (!claimed.count) continue;

    const message = await billingMessage(studio.id, due.stage, now);
    if (message.owner) {
      await notifyPreferred({
        studioId: studio.id,
        userId: message.owner.id,
        to: message.owner.email,
        subject: message.subject,
        body: message.text,
        template: `billing_reminder_${due.stage}`,
        relatedType: "Studio",
        relatedId: studio.id,
        url: "/plan",
        inbox: true,
      });
    }
    if (due.stage >= 2) await tellAdminsOverdue(studio, due.stage, due.dueAt);
    sent++;
  }
  return sent;
}

async function tellAdminsOverdue(studio: { id: string; name: string; brand: string }, stage: ReminderStage, dueAt: Date) {
  const title = stage === 2 ? `Vence hoy: ${studio.name}` : `Sin pagar hace 3 días: ${studio.name}`;
  await notifyPlatformAdmins(studio.id, {
    template: `billing_overdue_ops_${stage}`,
    subject: title,
    body: `${studio.name} ${stage === 2 ? "vence hoy" : `venció el ${dayText(dueAt)}`} y no hay pago registrado. Ya le mandamos el recordatorio.\n\nSeguilo desde la consola: Cobros → Próximos vencimientos.`,
    relatedType: "Studio",
    relatedId: studio.id,
  });
  const brand = brandByKey(studio.brand);
  const admins = await db.user.findMany({ where: { isPlatformAdmin: true, isActive: true }, select: { id: true } });
  for (const admin of admins) {
    await pushToUser(admin.id, {
      title,
      body: "Tocá para ver los vencimientos",
      url: `/admin/payments`,
      tag: `billing-${studio.id}`,
      icon: `${brand.iconBase}/icon-192.png`,
      badge: `${brand.iconBase}/icon-192.png`,
    }).catch(() => {});
  }
}

/** For the console: who is due in the next week or behind. */
export async function upcomingBeautyDues(now = new Date()) {
  const week = new Date(now.getTime() + 7 * 86_400_000);
  const since = new Date(now.getTime() - 45 * 86_400_000);
  const studios = await db.studio.findMany({
    where: {
      brand: "beauty",
      suspendedAt: null,
      OR: [
        { plan: "TRIAL", trialEndsAt: { gte: since, lte: week } },
        { plan: { not: "TRIAL" }, subscription: { currentPeriodEnd: { gte: since, lte: week } } },
      ],
    },
    include: { subscription: true },
  });
  return studios
    .map((s) => {
      const dueAt = dueDate(s, s.subscription)!;
      return {
        id: s.id,
        name: s.name,
        trial: s.plan === "TRIAL",
        plan: s.plan as Plan,
        nextPlan: s.nextPlan,
        dueAt,
        daysLeft: daysLeft(dueAt, now),
        autoDebit: onAutoDebit(s.subscription),
        reminded: s.billingRemindedFor?.getTime() === dueAt.getTime() ? s.billingReminderStage : 0,
      };
    })
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}
