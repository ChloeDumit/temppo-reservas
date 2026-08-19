/**
 * Short, human-quotable code for a pending transfer.
 *
 * Ambiguous characters (0/O, 1/I) are left out so a code read off a screen and
 * typed into WhatsApp still matches. Six characters over a 30-symbol alphabet
 * is ~10^8 combinations — far more than a studio's open payments at once.
 */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generatePaymentCode() {
  const bytes =
    typeof crypto !== "undefined" && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint8Array(6))
      : Uint8Array.from({ length: 6 }, () => Math.floor(Math.random() * 256));

  const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `TP-${code}`;
}

/** Digits only, as wa.me expects — no +, spaces or dashes. */
export function whatsappDigits(phone: string) {
  return phone.replace(/\D/g, "");
}

export function whatsappLink(phone: string, message: string) {
  return `https://wa.me/${whatsappDigits(phone)}?text=${encodeURIComponent(message)}`;
}
