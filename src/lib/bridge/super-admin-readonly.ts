/**
 * Shared policy for verified super-admin read-only surfaces.
 * Keep this module free of UI dependencies for server-side enforcement.
 */
export const normalizeRole = (r: string) => r.trim().toLowerCase();

export const isSuperAdminReadOnlySurface = (role: string | undefined, allow: string) =>
  normalizeRole(role ?? "") === "super_admin" && (allow === "buyer" || allow === "workspace");
