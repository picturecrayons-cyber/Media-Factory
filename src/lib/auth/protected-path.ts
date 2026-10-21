const PROTECTED_PREFIXES = [
  "/account",
  "/admin",
  "/admin-cms",
  "/buyer",
  "/cms",
  "/creator",
  "/dashboard",
  "/deliveries",
  "/finance",
  "/internal",
  "/investor",
  "/legal",
  "/licensing",
  "/onboarding",
  "/app",
  "/orders",
  "/qc",
  "/revenue",
  "/rights",
  "/studio",
  "/submit-film",
  "/super-admin",
  "/title",
  "/workspace",
] as const;

/** Paths requiring a Supabase cookie session before server rendering. */
export function requiresServerAuth(pathname: string): boolean {
  const normalized = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  return PROTECTED_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  );
}
