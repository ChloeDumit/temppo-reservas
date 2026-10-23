/**
 * A phone as WhatsApp addresses it: digits only, country code first
 * (59899123456). Studios type numbers however their clients say them, so a
 * local Uruguayan mobile (099 123 456) gains the 598 it is missing.
 *
 * Null when what is left cannot be a phone at all — too short or too long
 * for E.164 — so nothing is sent to a number that was never one.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 9) digits = `598${digits.slice(1)}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}
