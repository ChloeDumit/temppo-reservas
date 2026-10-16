import "server-only";
import { db } from "@/lib/db";
import { paymentProvider } from "@/lib/payments";
import { paymentRef } from "@/lib/payments/reference";
import type { ProviderPaymentStatus } from "@/lib/payments/types";
import { generatePaymentCode } from "@/lib/payment-code";
import { isOverlapError } from "./book";

/**
 * Deposits (señas). The platform collects them online on the studio's
 * behalf — every approved online deposit is owed to the studio until a payout
 * settles it. Transfers and cash go straight to the studio and are only
 * recorded here.
 */

/** Opens a Mercado Pago checkout for an appointment's deposit. */
export async function startDepositCheckout(opts: {
  appointmentId: string;
  payerEmail: string;
  successUrl: string;
  failureUrl: string;
  notificationUrl: string;
}) {
  const appt = await db.appointment.findUnique({
    where: { id: opts.appointmentId },
    include: { studio: true },
  });
  if (!appt || appt.status !== "PENDING_PAYMENT" || appt.depositCents <= 0) return null;

  const provider = paymentProvider();
  if (!provider.isConfigured()) return null;

  const payment = await db.payment.create({
    data: {
      studioId: appt.studioId,
      studentId: appt.clientId,
      appointmentId: appt.id,
      amountCents: appt.depositCents,
      currency: appt.studio.currency,
      method: "MERCADO_PAGO",
      status: "PENDING",
      provider: provider.name,
    },
  });

  const session = await provider.createCheckout({
    studioId: appt.studioId,
    externalReference: paymentRef("appt", appt.id),
    title: `${appt.studio.name} — seña ${appt.serviceName}`,
    amountCents: appt.depositCents,
    currency: appt.studio.currency,
    payerEmail: opts.payerEmail,
    successUrl: opts.successUrl,
    failureUrl: opts.failureUrl,
    notificationUrl: opts.notificationUrl,
  });

  await db.payment.update({ where: { id: payment.id }, data: { providerPaymentId: session.providerReference } });
  return session.redirectUrl;
}

export type SettleOutcome =
  | "confirmed"
  /** Paid, but the hold had lapsed and the slot is gone: owed back. */
  | "paid_too_late"
  | "already_settled"
  | "rejected"
  | "ignored";

/**
 * Applies what the provider says about a deposit. Idempotent — providers
 * retry — and it trusts nothing but the amount it was told to collect.
 */
export async function settleDeposit(opts: {
  appointmentId: string;
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  amountCents: number;
  now?: Date;
}): Promise<SettleOutcome> {
  const now = opts.now ?? new Date();
  const appt = await db.appointment.findUnique({
    where: { id: opts.appointmentId },
    include: {
      payments: { where: { method: "MERCADO_PAGO" }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!appt) return "ignored";

  // The payment this event is about: the one already carrying its id, or the
  // newest checkout still waiting.
  const payment =
    appt.payments.find((p) => p.providerPaymentId === opts.providerPaymentId) ??
    appt.payments.find((p) => p.status === "PENDING");
  if (!payment) return "ignored";

  if (opts.amountCents !== payment.amountCents) {
    console.error(
      `[deposits] amount mismatch for ${payment.id}: provider ${opts.amountCents}, expected ${payment.amountCents}`,
    );
    return "ignored";
  }

  if (opts.status === "REJECTED") {
    if (payment.status !== "PENDING") return "already_settled";
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "REJECTED", providerPaymentId: opts.providerPaymentId },
    });
    // The hold stays: she can try another card before it runs out.
    return "rejected";
  }

  if (opts.status !== "APPROVED") return "ignored";
  if (payment.status === "APPROVED") return "already_settled";

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "APPROVED", approvedAt: now, providerPaymentId: opts.providerPaymentId },
    });
    await tx.transaction.create({
      data: {
        studioId: appt.studioId,
        type: "INCOME",
        category: "Señas",
        description: appt.serviceName,
        amountCents: payment.amountCents,
        occurredAt: now,
        paymentId: payment.id,
      },
    });
  });

  return confirmPaidAppointment(appt.id, now);
}

/**
 * The deposit is in: confirm the appointment. If the hold ran out first, try
 * to take the slot back; if someone else has it, the money is owed back and
 * the appointment says so where staff will see it.
 */
async function confirmPaidAppointment(appointmentId: string, now: Date): Promise<SettleOutcome> {
  const appt = await db.appointment.findUniqueOrThrow({ where: { id: appointmentId } });

  if (appt.status === "PENDING_PAYMENT" || appt.status === "EXPIRED") {
    try {
      await db.appointment.update({
        where: { id: appt.id },
        data: { status: "CONFIRMED", depositStatus: "PAID", holdExpiresAt: null },
      });
      return "confirmed";
    } catch (error) {
      if (!isOverlapError(error)) throw error;
    }
  }

  if (appt.status === "CONFIRMED") {
    await db.appointment.update({ where: { id: appt.id }, data: { depositStatus: "PAID" } });
    return "confirmed";
  }

  await db.appointment.update({
    where: { id: appt.id },
    data: {
      depositStatus: "REFUNDED",
      staffNotes: [appt.staffNotes, `Seña pagada el ${now.toISOString().slice(0, 10)} después de liberarse el horario: devolver.`]
        .filter(Boolean)
        .join("\n"),
    },
  });
  return "paid_too_late";
}

/**
 * The client will pay the deposit by transfer and send the receipt over
 * WhatsApp. A transfer takes longer than a card, so the hold is stretched
 * to give her time; staff confirm it from Payments.
 */
export async function submitDepositTransfer(appointmentId: string, now = new Date()) {
  const appt = await db.appointment.findUnique({ where: { id: appointmentId }, include: { studio: true } });
  if (!appt || appt.status !== "PENDING_PAYMENT") return null;

  const existing = await db.payment.findFirst({
    where: { appointmentId, method: "BANK_TRANSFER", status: "PENDING" },
  });
  if (existing) return existing;

  const holdMs = Math.max(appt.studio.holdMinutes * 4, 120) * 60_000;
  const [payment] = await db.$transaction([
    db.payment.create({
      data: {
        studioId: appt.studioId,
        studentId: appt.clientId,
        appointmentId,
        amountCents: appt.depositCents,
        currency: appt.studio.currency,
        method: "BANK_TRANSFER",
        status: "PENDING",
        shortCode: generatePaymentCode(),
      },
    }),
    db.appointment.update({
      where: { id: appointmentId },
      data: { holdExpiresAt: new Date(now.getTime() + holdMs) },
    }),
  ]);
  return payment;
}

/** Staff confirm a transfer or cash deposit by hand. */
export async function approveDepositByStaff(paymentId: string, approvedById: string, now = new Date()) {
  const payment = await db.payment.findUnique({ where: { id: paymentId } });
  if (!payment?.appointmentId || payment.status === "APPROVED") return null;

  const appt = await db.appointment.findUniqueOrThrow({ where: { id: payment.appointmentId } });
  await db.$transaction([
    db.payment.update({
      where: { id: payment.id },
      data: { status: "APPROVED", approvedById, approvedAt: now },
    }),
    db.transaction.create({
      data: {
        studioId: payment.studioId,
        type: "INCOME",
        category: "Señas",
        description: appt.serviceName,
        amountCents: payment.amountCents,
        occurredAt: now,
        paymentId: payment.id,
      },
    }),
  ]);
  return confirmPaidAppointment(appt.id, now);
}

/**
 * What the platform holds for a studio: online deposits approved and not yet
 * handed over. Transfers and cash never pass through the platform.
 */
export async function owedToStudio(studioId: string) {
  const result = await db.payment.aggregate({
    where: {
      studioId,
      appointmentId: { not: null },
      method: "MERCADO_PAGO",
      status: "APPROVED",
      payoutId: null,
    },
    _sum: { amountCents: true },
    _count: true,
  });
  return { amountCents: result._sum.amountCents ?? 0, count: result._count };
}

/**
 * Records that the platform paid a studio what it was owed, up to now. The
 * payments it covers point back at it, so they drop out of the balance and
 * the studio can see which deposits each transfer settled.
 */
export async function createPayout(opts: {
  studioId: string;
  createdById: string | null;
  reference?: string | null;
  notes?: string | null;
  upTo?: Date;
}) {
  const upTo = opts.upTo ?? new Date();
  return db.$transaction(async (tx) => {
    const payments = await tx.payment.findMany({
      where: {
        studioId: opts.studioId,
        appointmentId: { not: null },
        method: "MERCADO_PAGO",
        status: "APPROVED",
        payoutId: null,
        approvedAt: { lte: upTo },
      },
      select: { id: true, amountCents: true, currency: true },
    });
    if (!payments.length) return null;

    const payout = await tx.studioPayout.create({
      data: {
        studioId: opts.studioId,
        amountCents: payments.reduce((sum, p) => sum + p.amountCents, 0),
        currency: payments[0].currency,
        status: "PAID",
        paidAt: new Date(),
        reference: opts.reference || null,
        notes: opts.notes || null,
        createdById: opts.createdById,
      },
    });
    await tx.payment.updateMany({
      where: { id: { in: payments.map((p) => p.id) } },
      data: { payoutId: payout.id },
    });
    return payout;
  });
}
