import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { paymentProvider, verifyMercadoPagoSignature } from "@/lib/payments";
import { recordAudit } from "@/lib/audit";
import { notifyPreferred } from "@/lib/notifications";

export const dynamic = "force-dynamic";

/**
 * Provider callback. The body is untrusted — it only tells us which payment to
 * go and read. Everything acted on comes from the provider's own API.
 */
export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Reject anything that isn't actually from Mercado Pago before we act.
  const dataId = (payload as { data?: { id?: string | number } })?.data?.id;
  const signatureOk = verifyMercadoPagoSignature({
    signatureHeader: request.headers.get("x-signature"),
    requestIdHeader: request.headers.get("x-request-id"),
    dataId: dataId != null ? String(dataId) : null,
  });

  if (!signatureOk) {
    console.warn("[payments/webhook] rejected: bad signature");
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const provider = paymentProvider();
  const resolved = await provider.resolveWebhook(payload).catch((error) => {
    console.error("[payments/webhook] resolve failed", error);
    return null;
  });

  // Always 200 on anything we can't act on, so the provider stops retrying.
  if (!resolved?.externalReference) return NextResponse.json({ ok: true });

  const studentPack = await db.studentPack.findUnique({
    where: { id: resolved.externalReference },
    include: {
      pack: true,
      student: { include: { user: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!studentPack) return NextResponse.json({ ok: true });

  const payment = studentPack.payments[0];
  if (!payment) return NextResponse.json({ ok: true });

  // Amounts must agree before anything is credited.
  if (resolved.amountCents !== payment.amountCents) {
    console.error(
      `[payments/webhook] amount mismatch for ${payment.id}: provider ${resolved.amountCents}, expected ${payment.amountCents}`,
    );
    return NextResponse.json({ ok: true });
  }

  if (payment.status === "APPROVED" && resolved.status === "APPROVED") {
    return NextResponse.json({ ok: true }); // already handled
  }

  const now = new Date();

  if (resolved.status === "APPROVED") {
    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "APPROVED",
          approvedAt: now,
          providerPaymentId: resolved.providerPaymentId,
        },
      });

      await tx.studentPack.update({
        where: { id: studentPack.id },
        data: {
          status: "ACTIVE",
          startsAt: now,
          expiresAt: new Date(now.getTime() + studentPack.pack.validityDays * 86_400_000),
        },
      });

      await tx.transaction.create({
        data: {
          studioId: payment.studioId,
          type: "INCOME",
          category: "Packs",
          description: studentPack.pack.name,
          amountCents: payment.amountCents,
          occurredAt: now,
          paymentId: payment.id,
        },
      });
    });

    await notifyPreferred({
      studioId: payment.studioId,
      to: studentPack.student.user.email,
      phone: studentPack.student.user.phone,
      template: "payment_approved",
      subject: "Pago confirmado",
      body: `Hola ${studentPack.student.user.name}, tu pago fue confirmado. Ya podés reservar tus clases.`,
      relatedType: "Payment",
      relatedId: payment.id,
    });
  } else if (resolved.status === "REJECTED" || resolved.status === "REFUNDED") {
    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: resolved.status === "REFUNDED" ? "REFUNDED" : "REJECTED",
          providerPaymentId: resolved.providerPaymentId,
        },
      });
      await tx.studentPack.update({
        where: { id: studentPack.id },
        data: { status: "CANCELLED" },
      });
    });
  } else {
    return NextResponse.json({ ok: true }); // still pending
  }

  await recordAudit({
    studioId: payment.studioId,
    actorLabel: `${provider.name} webhook`,
    action: `payment.webhook_${resolved.status.toLowerCase()}`,
    entityType: "Payment",
    entityId: payment.id,
    metadata: { providerPaymentId: resolved.providerPaymentId },
  });

  return NextResponse.json({ ok: true });
}
