"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertUser } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { paymentProvider } from "@/lib/payments";
import { generatePaymentCode } from "@/lib/payment-code";
import { notifyOwners } from "@/lib/notifications";
import { formatMoney } from "@/lib/money";
import { localePath } from "@/i18n/routing";

export type BuyState = {
  error?: string;
  ok?: boolean;
  /** Returned on success so the student can quote it when sending the receipt. */
  shortCode?: string;
  amountCents?: number;
  packName?: string;
} | null;

/** Creates the pending pack + payment both purchase paths hang off. */
async function createPendingPurchase(params: {
  studioId: string;
  studentId: string;
  packId: string;
  method: "MERCADO_PAGO" | "BANK_TRANSFER";
  currency: string;
  reference?: string | null;
  proofUrl?: string | null;
  shortCode?: string | null;
}) {
  const pack = await db.classPack.findFirst({
    where: { id: params.packId, studioId: params.studioId, isActive: true },
  });
  if (!pack) return null;

  const now = new Date();

  return db.$transaction(async (tx) => {
    const studentPack = await tx.studentPack.create({
      data: {
        studioId: params.studioId,
        studentId: params.studentId,
        packId: pack.id,
        creditsTotal: pack.isUnlimited ? 0 : pack.credits,
        isUnlimited: pack.isUnlimited,
        // Stays dormant until the money is confirmed.
        status: "PENDING_PAYMENT",
        startsAt: now,
        expiresAt: new Date(now.getTime() + pack.validityDays * 86_400_000),
      },
    });

    const payment = await tx.payment.create({
      data: {
        studioId: params.studioId,
        studentId: params.studentId,
        studentPackId: studentPack.id,
        amountCents: pack.priceCents,
        currency: params.currency,
        method: params.method,
        status: "PENDING",
        reference: params.reference ?? null,
        proofUrl: params.proofUrl ?? null,
        shortCode: params.shortCode ?? null,
        provider: params.method === "MERCADO_PAGO" ? paymentProvider().name : null,
      },
    });

    return { pack, studentPack, payment };
  });
}

const transferSchema = z.object({
  packId: z.string().min(1),
  reference: z.string().trim().max(160).optional(),
  proofUrl: z.string().trim().max(500).optional(),
});

/** Bank transfer: the studio reviews the proof and approves it by hand. */
export async function submitTransferAction(
  _prev: BuyState,
  formData: FormData,
): Promise<BuyState> {
  const user = await assertUser();
  if (!user.studentProfile) return { error: "forbidden" };

  const parsed = transferSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const proofUrl = parsed.data.proofUrl?.trim();
  if (proofUrl && !/^https?:\/\//i.test(proofUrl)) return { error: "proofUrl" };

  const shortCode = generatePaymentCode();

  const created = await createPendingPurchase({
    studioId: user.studioId,
    studentId: user.studentProfile.id,
    packId: parsed.data.packId,
    method: "BANK_TRANSFER",
    currency: user.studio.currency,
    reference: parsed.data.reference || null,
    proofUrl: proofUrl || null,
    shortCode,
  });

  if (!created) return { error: "notFound" };

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "payment.submit_transfer",
    entityType: "Payment",
    entityId: created.payment.id,
    metadata: { packId: parsed.data.packId, amountCents: created.payment.amountCents },
  });

  // Nothing credits the student until an owner approves this by hand, so the
  // payment sitting in the queue is useless unless somebody is told it landed.
  const amount = formatMoney(
    created.payment.amountCents,
    user.studio.currency,
    user.studio.locale,
  );

  await notifyOwners(user.studioId, {
    url: "/payments",
    template: "payment_submitted",
    subject: `${user.studio.name} — pago para aprobar`,
    body:
      user.studio.locale === "en"
        ? `${user.name} submitted a bank transfer for ${created.pack.name} (${amount}). Code: ${shortCode}.${parsed.data.reference ? `\nReference: ${parsed.data.reference}` : ""}${proofUrl ? `\nProof: ${proofUrl}` : ""}\n\nApprove it in Payments to activate their pack.`
        : `${user.name} envió una transferencia por ${created.pack.name} (${amount}). Código: ${shortCode}.${parsed.data.reference ? `\nReferencia: ${parsed.data.reference}` : ""}${proofUrl ? `\nComprobante: ${proofUrl}` : ""}\n\nAprobalo en Pagos para activarle el pack.`,
    relatedType: "Payment",
    relatedId: created.payment.id,
  });

  revalidatePath("/[locale]/(app)/buy", "page");
  return { ok: true, shortCode, amountCents: created.payment.amountCents, packName: created.pack.name };
}

/** Online checkout: hands off to the provider and returns with a webhook. */
export async function startCheckoutAction(formData: FormData) {
  const user = await assertUser();
  if (!user.studentProfile) return;

  const packId = String(formData.get("packId") ?? "");
  const provider = paymentProvider();
  if (!provider.isConfigured()) return;

  const created = await createPendingPurchase({
    studioId: user.studioId,
    studentId: user.studentProfile.id,
    packId,
    method: "MERCADO_PAGO",
    currency: user.studio.currency,
  });
  if (!created) return;

  const base = process.env.APP_URL || "http://localhost:3000";


  const session = await provider.createCheckout({
    studioId: user.studioId,
    studentPackId: created.studentPack.id,
    title: `${user.studio.name} — ${created.pack.name}`,
    amountCents: created.payment.amountCents,
    currency: user.studio.currency,
    payerEmail: user.email,
    successUrl: `${base}${localePath(user.studio.locale, "/my")}?purchase=ok`,
    failureUrl: `${base}${localePath(user.studio.locale, "/buy")}?purchase=failed`,
    notificationUrl: `${base}/api/payments/webhook`,
  });

  await db.payment.update({
    where: { id: created.payment.id },
    data: { providerPaymentId: session.providerReference },
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "payment.checkout_start",
    entityType: "Payment",
    entityId: created.payment.id,
    metadata: { provider: provider.name, packId },
  });

  redirect(session.redirectUrl);
}
