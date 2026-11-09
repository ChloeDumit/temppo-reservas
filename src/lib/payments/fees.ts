/**
 * The platform's cut of a deposit paid into a studio's own Mercado Pago
 * account. Zero unless configured.
 *
 * One definition, shared by every vertical that takes a seña: two copies
 * drifting apart would mean the platform quietly charging different rates for
 * a chair and a court.
 */
export function marketplaceFeeCents(amountCents: number) {
  const percent = Number(process.env.MERCADOPAGO_MARKETPLACE_FEE_PERCENT || 0);
  return percent > 0 ? Math.round((amountCents * percent) / 100) : 0;
}
