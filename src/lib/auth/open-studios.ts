/**
 * Of the accounts one person can sign in to, the ones at studios still open.
 *
 * The same email can own a studio that was suspended and another that was
 * not; signing in must land on the open one, and the studio picker should not
 * offer the closed one. Only when every account is at a suspended studio are
 * they all kept — the person then reaches the «suspendido» page and is told
 * why, instead of a wrong-password error.
 */
export function preferOpenStudios<T extends { isPlatformAdmin: boolean; studio: { suspendedAt: Date | null } }>(accounts: T[]): T[] {
  const open = accounts.filter((a) => !a.studio.suspendedAt || a.isPlatformAdmin);
  return open.length ? open : accounts;
}
