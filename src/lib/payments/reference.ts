/**
 * What a provider payment is for, round-tripped through external_reference.
 *
 * Packs used to send their bare id, and Mercado Pago keeps calling back about
 * preferences created back then — so anything without a prefix is a pack.
 */
export type PaymentRef = { kind: "pack" | "appt"; id: string };

export function paymentRef(kind: PaymentRef["kind"], id: string) {
  return `${kind}:${id}`;
}

export function parsePaymentRef(value: string | null | undefined): PaymentRef | null {
  if (!value) return null;
  const match = /^(pack|appt):(.+)$/.exec(value);
  if (match) return { kind: match[1] as PaymentRef["kind"], id: match[2] };
  return { kind: "pack", id: value };
}
