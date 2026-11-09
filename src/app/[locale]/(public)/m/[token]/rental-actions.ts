"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { findRentalByManageToken, cancelRental } from "@/lib/venues/book";
import { startRentalDepositCheckout, submitRentalTransfer } from "@/lib/venues/payments";

export type RentalManageState = { error?: string } | null;

/** The site this request arrived on, so a return URL points back at it. */
async function baseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return process.env.APP_URL || (host ? `${proto}://${host}` : "http://localhost:3000");
}

/**
 * Pays the seña, by card or by saying a transfer is on its way.
 *
 * The token is the only credential, and it is never trusted beyond finding the
 * booking: the amount, the court and whether anything is owed all come from
 * the row, never from the form.
 */
export async function payRentalAction(
  _prev: RentalManageState,
  formData: FormData,
): Promise<RentalManageState> {
  const token = String(formData.get("token") ?? "");
  const method = String(formData.get("method") ?? "transfer");

  const rental = await findRentalByManageToken(token);
  if (!rental || rental.status !== "PENDING_PAYMENT") return { error: "generic" };

  if (method === "transfer") {
    const payment = await submitRentalTransfer(rental.id);
    if (!payment) return { error: "generic" };
    revalidatePath(`/[locale]/(public)/m/[token]`, "page");
    return null;
  }

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "generic" };

  const base = await baseUrl();
  const back = `${base}/es/m/${token}`;

  const url = await startRentalDepositCheckout({
    rentalId: rental.id,
    payerEmail: email,
    successUrl: `${back}?paid=1`,
    failureUrl: back,
    notificationUrl: `${base}/api/payments/webhook`,
  });
  if (!url) return { error: "generic" };

  redirect(url);
}

/** Gives the court back. The cutoff is checked here, not only in the markup. */
export async function cancelRentalByTokenAction(
  _prev: RentalManageState,
  formData: FormData,
): Promise<RentalManageState> {
  const token = String(formData.get("token") ?? "");

  const rental = await findRentalByManageToken(token);
  if (!rental) return { error: "generic" };

  const cutoff = new Date(
    rental.startsAt.getTime() - rental.studio.cancellationCutoffHours * 3_600_000,
  );
  if (new Date() > cutoff) return { error: "generic" };

  await cancelRental(rental.studioId, rental.id, "client");
  revalidatePath(`/[locale]/(public)/m/[token]`, "page");
  return null;
}
