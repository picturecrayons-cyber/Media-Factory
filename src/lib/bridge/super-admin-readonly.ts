/**
 * Shared policy for verified super_admin read-only surfaces.
 * No UI or environment dependencies: safe to import in server handlers.
 */
export const normalizeRole = (r: string) => r.trim().toLowerCase();

export const isSuperAdminReadOnlySurface = (
  role: string | undefined,
  allow: string,
) =>
  normalizeRole(role ?? "") === "super_admin" &&
  (allow === "buyer" || allow === "workspace");
