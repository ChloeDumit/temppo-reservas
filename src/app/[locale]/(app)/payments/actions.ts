"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertAdmin } from "@/lib/auth/guards";
import { recordAudit } from "@/lib/audit";
import { parseMoneyToCents } from "@/lib/money";
import { notifyPreferred } from "@/lib/notifications";

export type ActionState = { error?: string; ok?: boolean } | null;

function revalidateMoney() {
  revalidatePath("/[locale]/(app)/payments", "page");
  revalidatePath("/[locale]/(app)/dashboard", "page");
}

/**
 * Approving a manual payment is what actually gives the student their classes:
 * it activates (or creates) the pack and books the income in one transaction.
 */
export async function approvePaymentAction(formData: FormData) {
  const user = await assertAdmin();
  const paymentId = String(formData.get("paymentId") ?? "");
  const packId = String(formData.get("packId") ?? "");

  const payment = await db.payment.findFirst({
    where: { id: paymentId, studioId: user.studioId },
    include: { student: { include: { user: true } }, studentPack: true },
  });
  if (!payment || payment.status === "APPROVED") return;

  const now = new Date();

  await db.$transaction(async (tx) => {
    let studentPackId = payment.studentPackId;

    if (payment.studentPack) {
      const pack = await tx.classPack.findUnique({ where: { id: payment.studentPack.packId } });
      await tx.studentPack.update({
        where: { id: payment.studentPack.id },
        data: {
          status: "ACTIVE",
          startsAt: now,
          expiresAt: new Date(now.getTime() + (pack?.validityDays ?? 30) * 86_400_000),
        },
      });
    } else if (packId) {
      // Staff approved a payment that wasn't tied to a pack yet — attach one now.
      const pack = await tx.classPack.findFirst({
        where: { id: packId, studioId: user.studioId },
      });
      if (pack) {
        const created = await tx.studentPack.create({
          data: {
            studioId: user.studioId,
            studentId: payment.studentId,
            packId: pack.id,
            creditsTotal: pack.isUnlimited ? 0 : pack.credits,
            isUnlimited: pack.isUnlimited,
            status: "ACTIVE",
            startsAt: now,
            expiresAt: new Date(now.getTime() + pack.validityDays * 86_400_000),
          },
        });
        studentPackId = created.id;
      }
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "APPROVED",
        approvedById: user.id,
        approvedAt: now,
        studentPackId,
      },
    });

    await tx.transaction.create({
      data: {
        studioId: user.studioId,
        type: "INCOME",
        category: "Packs",
        description: payment.student.user.name,
        amountCents: payment.amountCents,
        occurredAt: now,
        paymentId: payment.id,
      },
    });
  });

  await notifyPreferred({
    studioId: user.studioId,
    to: payment.student.user.email,
    phone: payment.student.user.phone,
    template: "payment_approved",
    subject: `${user.studio.name} — pago confirmado`,
    body: `Hola ${payment.student.user.name}, confirmamos tu pago. Ya podés reservar tus clases.`,
    relatedType: "Payment",
    relatedId: payment.id,
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "payment.approve",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { amountCents: payment.amountCents, studentId: payment.studentId },
  });

  revalidateMoney();
}

export async function rejectPaymentAction(formData: FormData) {
  const user = await assertAdmin();
  const paymentId = String(formData.get("paymentId") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(0, 300);

  const payment = await db.payment.findFirst({
    where: { id: paymentId, studioId: user.studioId },
    include: { student: { include: { user: true } } },
  });
  if (!payment || payment.status !== "PENDING") return;

  await db.payment.update({
    where: { id: payment.id },
    data: { status: "REJECTED", rejectedReason: reason || null },
  });

  await notifyPreferred({
    studioId: user.studioId,
    to: payment.student.user.email,
    phone: payment.student.user.phone,
    template: "payment_rejected",
    subject: `${user.studio.name} — problema con tu pago`,
    body: `Hola ${payment.student.user.name}, no pudimos confirmar tu pago.${reason ? ` Motivo: ${reason}` : ""} Escribinos para resolverlo.`,
    relatedType: "Payment",
    relatedId: payment.id,
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "payment.reject",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { reason },
  });

  revalidateMoney();
}

const manualPaymentSchema = z.object({
  studentId: z.string().min(1),
  packId: z.string().min(1),
  amount: z.string(),
  method: z.enum(["BANK_TRANSFER", "CASH", "MERCADO_PAGO", "OTHER"]),
  reference: z.string().trim().max(120).optional(),
});

/** Staff records a payment they already received — approved on the spot. */
export async function recordPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = manualPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (amountCents === null) return { error: "priceInvalid" };

  const pack = await db.classPack.findFirst({
    where: { id: parsed.data.packId, studioId: user.studioId },
  });
  const student = await db.studentProfile.findFirst({
    where: { id: parsed.data.studentId, user: { studioId: user.studioId } },
  });
  if (!pack || !student) return { error: "notFound" };

  const now = new Date();

  const payment = await db.$transaction(async (tx) => {
    const studentPack = await tx.studentPack.create({
      data: {
        studioId: user.studioId,
        studentId: student.id,
        packId: pack.id,
        creditsTotal: pack.isUnlimited ? 0 : pack.credits,
        isUnlimited: pack.isUnlimited,
        status: "ACTIVE",
        startsAt: now,
        expiresAt: new Date(now.getTime() + pack.validityDays * 86_400_000),
      },
    });

    const created = await tx.payment.create({
      data: {
        studioId: user.studioId,
        studentId: student.id,
        studentPackId: studentPack.id,
        amountCents,
        currency: user.studio.currency,
        method: parsed.data.method,
        status: "APPROVED",
        reference: parsed.data.reference || null,
        approvedById: user.id,
        approvedAt: now,
      },
    });

    await tx.transaction.create({
      data: {
        studioId: user.studioId,
        type: "INCOME",
        category: "Packs",
        description: pack.name,
        amountCents,
        occurredAt: now,
        paymentId: created.id,
      },
    });

    return created;
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "payment.record",
    entityType: "Payment",
    entityId: payment.id,
    metadata: { amountCents, packId: pack.id, studentId: student.id },
  });

  revalidateMoney();
  return { ok: true };
}

const expenseSchema = z.object({
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().max(200).optional(),
  amount: z.string(),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function addExpenseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertAdmin();
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "generic" };

  const amountCents = parseMoneyToCents(parsed.data.amount);
  if (amountCents === null) return { error: "priceInvalid" };

  const created = await db.transaction.create({
    data: {
      studioId: user.studioId,
      type: "EXPENSE",
      category: parsed.data.category,
      description: parsed.data.description || null,
      amountCents,
      occurredAt: new Date(`${parsed.data.occurredAt}T12:00:00Z`),
    },
  });

  await recordAudit({
    studioId: user.studioId,
    actorId: user.id,
    actorLabel: user.name,
    action: "transaction.expense",
    entityType: "Transaction",
    entityId: created.id,
    metadata: { amountCents, category: parsed.data.category },
  });

  revalidateMoney();
  return { ok: true };
}
