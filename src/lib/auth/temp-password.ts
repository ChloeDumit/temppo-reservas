import "server-only";

/**
 * Temporary passwords handed out when staff create an account.
 *
 * Read aloud across a reception desk or copied into WhatsApp, so the alphabet
 * drops characters that get confused in either medium: 0/O, 1/I/l, 5/S, 8/B.
 * Grouped in threes because that is how people read them back.
 *
 * Roughly 28^9 combinations, and it is single-use in practice — the holder is
 * forced to replace it the first time they sign in.
 */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23479";

export function generateTempPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]);

  return [chars.slice(0, 3).join(""), chars.slice(3, 6).join(""), chars.slice(6).join("")].join(
    "-",
  );
}
