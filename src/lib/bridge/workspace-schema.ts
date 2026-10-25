/** PostgreSQL errors that mean optional organization scope cannot be resolved. */
export function isMissingOrganizationSchemaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "42P01" || candidate.code === "42703") return true;
  const message = typeof candidate.message === "string" ? candidate.message : "";
  return /relation ["']?bridge_(?:organization_memberships|organizations)["']? does not exist|column .*organization_id.* does not exist/i.test(message);
}

/** Return a safe diagnostic code without exposing connection details or SQL. */
export function workspaceFailureCode(error: unknown): "CONFIG_MISSING" | "MISSING_RELATION" | "WORKSPACE_QUERY_FAILED" {
  const candidate = error as { code?: unknown; message?: unknown } | null;
  const message = typeof candidate?.message === "string" ? candidate.message : "";
  if (/DATABASE_URL|POSTGRES_URL|Supabase (?:URL|publishable key) configuration is missing|Supabase URL aliases resolve to different projects/i.test(message)) {
    return "CONFIG_MISSING";
  }
  if (candidate?.code === "42P01" || candidate?.code === "42703" || /relation .* does not exist|column .* does not exist/i.test(message)) {
    return "MISSING_RELATION";
  }
  return "WORKSPACE_QUERY_FAILED";
}
