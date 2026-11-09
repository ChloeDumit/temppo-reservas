import "server-only";
import { db } from "@/lib/db";
import { paymentProvider } from "@/lib/payments";
import { paymentRef } from "@/lib/payments/reference";
import { studioAccessToken } from "@/lib/payments/mercadopago-oauth";
import { marketplaceFeeCents } from "@/lib/payments/fees";
import type { ProviderPaymentStatus } from "@/lib/payments/types";
import { onlineSurchargeFor } from "@/lib/appointments/deposit";
import { generatePaymentCode } from "@/lib/payment-code";
import { isSlotOpen } from "@/lib/appointments/slots";
import { dateKeyInZone } from "@/lib/dates";
import { venueAvailabilityQuery } from "./availability";

/**
 * Taking the seña for a court.
 *
 * Shaped like the appointments deposit it sits beside, because the awkward
 * case is the same one: money arriving after the hold has lapsed. A court is
 * not a chair, though — nobody is waiting to be told which professional got
 * the slot — so this is its own file rather than a flag through that one.
 */

export type RentalSettleOutcome =
  | "confirmed"
  /** Paid, but the hold had lapsed and the court is gone: owed back. */
  | "paid_too_late"
  /** Paid late, but nobody took the court meanwhile: confirmed anyway. */
  | "confirmed_late"
  | "rejected"
  | "ignored";

/** Sends the client to Mercado Pago for the seña. Null when it cannot start. */
export async function startRentalDepositCheckout(opts: {
  rentalId: string;
  payerEmail: string;
  successUrl: string;
  failureUrl: string;
  notificationUrl: string;
}) {
  const rental = await db.rental.findUnique({
    where: { id: opts.rentalId },
    include: { studio: true },
  });
  if (!rental || rental.status !== "PENDING_PAYMENT" || rental.depositCents <= 0) return null;

  const provider = paymentProvider();
  const studioToken = await studioAccessToken(rental.studioId);
  if (!studioToken && !provider.isConfigured()) return null;

  const surchargeCents = onlineSurchargeFor(rental.depositCents, rental.studio);
  const payment = await db.payment.create({
    data: {
      studioId: rental.studioId,
      studentId: rental.clientId!,
      rentalId: rental.id,
      amountCents: rental.depositCents,
      surchargeCents,
      currency: rental.studio.currency,
      method: "MERCADO_PAGO",
      status: "PENDING",
      provider: provider.name,
      collectedByStudio: Boolean(studioToken),
    },
  });

  // The webhook needs to know whose account to read the payment from.
  const notificationUrl = new URL(opts.notificationUrl);
  if (studioToken) notificationUrl.searchParams.set("studio", rental.studioId);

  const session = await provider.createCheckout({
    studioId: rental.studioId,
    externalReference: paymentRef("rental", rental.id),
    title: `${rental.studio.name} — seña ${rental.spaceName}`,
    amountCents: rental.depositCents,
    ...(surchargeCents
      ? { surcharge: { title: "Cargo por pago online", amountCents: surchargeCents } }
      : {}),
    currency: rental.studio.currency,
    payerEmail: opts.payerEmail,
    successUrl: opts.successUrl,
    failureUrl: opts.failureUrl,
    notificationUrl: notificationUrl.toString(),
    // A little past the hold, so a card mid-payment as it ends still goes through.
    ...(rental.holdExpiresAt
      ? { expiresAt: new Date(rental.holdExpiresAt.getTime() + 5 * 60_000) }
      : {}),
    ...(studioToken
      ? { accessToken: studioToken, marketplaceFeeCents: marketplaceFeeCents(rental.depositCents) }
      : {}),
  });

  await db.payment.update({
    where: { id: payment.id },
    data: { providerPaymentId: session.providerReference },
  });
  return session.redirectUrl;
}

/**
 * What the provider told us about a seña.
 *
 * Idempotent: the provider retries, and a court must not be confirmed twice
 * or refunded twice because a webhook arrived again.
 */
export async function settleRentalDeposit(opts: {
  rentalId: string;
  providerPaymentId: string;
  status: ProviderPaymentStatus;
  amountCents: number;
  now?: Date;
}): Promise<RentalSettleOutcome> {
  const now = opts.now ?? new Date();

  const rental = await db.rental.findUnique({
    where: { id: opts.rentalId },
    include: { studio: true },
  });
  if (!rental) return "ignored";

  // A refund is reconciled by the club, not by flipping the court back.
  if (opts.status === "PENDING" || opts.status === "REFUNDED") return "ignored";

  if (opts.status === "REJECTED") {
    // The hold stands until it lapses: a declined card is often retried.
    await db.payment.updateMany({
      where: { rentalId: rental.id, providerPaymentId: opts.providerPaymentId },
      data: { status: "REJECTED" },
    });
    return "rejected";
  }

  // Already settled by an earlier delivery of the same webhook.
  if (rental.depositStatus === "PAID") return "ignored";

  // Short payment: treat as unpaid rather than confirming a court for less.
  if (opts.amountCents < rental.depositCents) return "ignored";

  const lapsed = Boolean(rental.holdExpiresAt && rental.holdExpiresAt < now);

  if (lapsed) {
    /*
      Paid as the hold ran out. If nobody took the court meanwhile, honour it —
      the client did pay, and refusing would be both unkind and bad business.
      If someone did, the money is owed back and the club is told.
    */
    const stillFree = await courtStillFree(rental, now);
    if (!stillFree) {
      await db.$transaction([
        db.payment.updateMany({
          where: { rentalId: rental.id, providerPaymentId: opts.providerPaymentId },
          data: { status: "APPROVED", approvedAt: now },
        }),
        db.rental.update({
          where: { id: rental.id },
          data: { depositStatus: "PAID", status: "CANCELLED", cancelledAt: now, cancelReason: "hold_expired" },
        }),
      ]);
      return "paid_too_late";
    }
  }

  await db.$transaction([
    db.payment.updateMany({
      where: { rentalId: rental.id, providerPaymentId: opts.providerPaymentId },
      data: { status: "APPROVED", approvedAt: now },
    }),
    db.rental.update({
      where: { id: rental.id },
      data: { status: "CONFIRMED", depositStatus: "PAID", holdExpiresAt: null },
    }),
  ]);

  return lapsed ? "confirmed_late" : "confirmed";
}

/** Whether this court is still open at this time, ignoring the booking itself. */
async function courtStillFree(
  rental: { id: string; spaceId: string; startsAt: Date; endsAt: Date; studio: { id: string; timezone: string; bookingOpensDaysAhead: number; minNoticeMinutes: number; slotStepMinutes: number } },
  now: Date,
) {
  const durationMin = Math.round((rental.endsAt.getTime() - rental.startsAt.getTime()) / 60_000);

  const found = await venueAvailabilityQuery(
    // The notice has nothing to say here: the booking was made in good time.
    { ...rental.studio, minNoticeMinutes: 0 },
    {
      spaceIds: [rental.spaceId],
      durationMin,
      fromDate: dateKeyInZone(rental.startsAt, rental.studio.timezone),
      days: 1,
      now,
      excludeRentalId: rental.id,
    },
  );
  if (!found) return false;
  return isSlotOpen(found.query, rental.spaceId, rental.startsAt);
}

/**
 * The client says they have transferred the seña.
 *
 * Records the claim with a short code they quote when they send the receipt,
 * so the club can match a screenshot to a court without asking who they are.
 * Asking twice returns the same code rather than minting another.
 */
export async function submitRentalTransfer(rentalId: string, now = new Date()) {
  const rental = await db.rental.findUnique({ where: { id: rentalId } });
  if (!rental || rental.status !== "PENDING_PAYMENT" || rental.depositCents <= 0) return null;

  const existing = await db.payment.findFirst({
    where: { rentalId: rental.id, method: "BANK_TRANSFER", status: "PENDING" },
  });
  if (existing) return existing;

  return db.payment.create({
    data: {
      studioId: rental.studioId,
      studentId: rental.clientId!,
      rentalId: rental.id,
      amountCents: rental.depositCents,
      currency: "UYU",
      method: "BANK_TRANSFER",
      status: "PENDING",
      shortCode: generatePaymentCode(),
      createdAt: now,
    },
  });
}

/** The club saw the receipt. Confirms the court. */
export async function approveRentalTransfer(paymentId: string, approvedById: string, now = new Date()) {
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { rental: true } });
  if (!payment?.rental || payment.status !== "PENDING") return false;

  await db.$transaction([
    db.payment.update({
      where: { id: payment.id },
      data: { status: "APPROVED", approvedAt: now, approvedById },
    }),
    db.rental.update({
      where: { id: payment.rental.id },
      data: { status: "CONFIRMED", depositStatus: "PAID", holdExpiresAt: null },
    }),
  ]);
  return true;
}

/**
 * Hands back courts nobody paid for.
 *
 * A hold that lapses frees the slot by itself — liveRentalFilter stops
 * counting it — but leaving the row as PENDING_PAYMENT would show a club a
 * booking that is not one, so it is closed off explicitly.
 */
export async function expireRentalHolds(studioId: string, now: Date) {
  const stale = await db.rental.findMany({
    where: { studioId, status: "PENDING_PAYMENT", holdExpiresAt: { lt: now } },
    select: { id: true },
  });
  if (stale.length === 0) return 0;

  await db.rental.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: { status: "CANCELLED", cancelledAt: now, cancelReason: "hold_expired" },
  });
  return stale.length;
}
