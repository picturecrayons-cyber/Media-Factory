/**
 * Resolve one canonical Supabase URL across Vite/browser and server runtimes.
 * Empty aliases are ignored. If multiple aliases are configured, they must
 * identify the same URL; silently choosing between projects is unsafe.
 */
export function resolveCanonicalSupabaseUrl(
  ...values: Array<string | undefined>
): string | undefined {
  const normalized = values
    .map((value) => value?.trim().replace(/\/+$/, ""))
    .filter((value): value is string => Boolean(value));

  const unique = [...new Set(normalized)];
  if (unique.length > 1) {
    throw new Error("CONFIG_MISSING: Supabase URL aliases resolve to different projects.");
  }
  return unique[0];
}

const SUPABASE_REF_BY_ENVIRONMENT = {
  preview: "jbymleftneggcgutlcqu",
  production: "mlmgugivsyoxzdgwkbpu",
} as const;

export type BridgeDeploymentEnvironment = keyof typeof SUPABASE_REF_BY_ENVIRONMENT;

/**
 * Enforce environment-to-project isolation. Unknown environments and missing
 * URLs fail closed; Preview must never fall back to the Production project.
 */
export function resolveEnvironmentScopedSupabaseUrl(
  deploymentEnvironment: string | undefined,
  ...values: Array<string | undefined>
): string {
  const environment = deploymentEnvironment?.trim().toLowerCase();
  if (environment !== "preview" && environment !== "production") {
    throw new Error("CONFIG_MISSING: Bridge deployment environment must be preview or production.");
  }

  const url = resolveCanonicalSupabaseUrl(...values);
  if (!url) {
    throw new Error("CONFIG_MISSING: Supabase URL configuration is missing.");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("CONFIG_MISSING: Supabase URL is invalid.");
  }

  const expectedRef = SUPABASE_REF_BY_ENVIRONMENT[environment as BridgeDeploymentEnvironment];
  if (parsed.protocol !== "https:" || parsed.hostname !== `${expectedRef}.supabase.co`) {
    throw new Error("CONFIG_MISSING: Supabase project does not match this deployment environment.");
  }

  return url;
}
