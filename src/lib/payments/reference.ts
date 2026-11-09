/**
 * What a provider payment is for, round-tripped through external_reference.
 *
 * Packs used to send their bare id, and Mercado Pago keeps calling back about
 * preferences created back then — so anything without a prefix is a pack.
 *
 * "appt" is a seña for an appointment, "rental" one for a court.
 */
export type PaymentRef = { kind: "pack" | "appt" | "rental" | "charge"; id: string };

export function paymentRef(kind: PaymentRef["kind"], id: string) {
  return `${kind}:${id}`;
}

export function parsePaymentRef(value: string | null | undefined): PaymentRef | null {
  if (!value) return null;
  // "charge:" is a studio paying the platform (its plan, extra WhatsApp).
  const match = /^(pack|appt|rental|charge):(.+)$/.exec(value);
  if (match) return { kind: match[1] as PaymentRef["kind"], id: match[2] };
  return { kind: "pack", id: value };
}
