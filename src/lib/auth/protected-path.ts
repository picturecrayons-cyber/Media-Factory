const PROTECTED_PREFIXES = [
  "/account",
  "/buyer",
  "/creator",
  "/dashboard",
  "/deliveries",
  "/finance",
  "/internal",
  "/investor",
  "/legal",
  "/licensing",
  "/onboarding",
  "/orders",
  "/qc",
  "/revenue",
  "/rights",
  "/studio",
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
