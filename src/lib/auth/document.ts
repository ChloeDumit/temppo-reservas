/**
 * Cédulas get written 1.234.567-8, 1234567-8 or 12345678 depending on who is
 * typing. Store and compare one canonical form so the same person matches
 * however they enter it.
 */
export function normalizeDocumentId(input: string): string {
  return input.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

/** Short enough to remember, long enough not to be guessed in a few tries. */
export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;
