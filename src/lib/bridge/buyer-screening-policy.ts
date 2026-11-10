export function isBuyerScreeningGrantActive(
  grant: { expiresAt: string | null; revokedAt: string | null },
  now = Date.now(),
): boolean {
  if (grant.revokedAt) return false;
  if (!grant.expiresAt) return true;
  const expiry = Date.parse(grant.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}
