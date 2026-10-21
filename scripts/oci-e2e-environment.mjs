/**
 * Fail closed unless an operator explicitly attests that the configured
 * Supabase host and OCI bucket are non-production test resources.
 *
 * This is an execution guard, not proof of isolation; environment ownership
 * and credential scope must still be verified independently.
 */
export function assertNonProductionOciE2E(env = process.env) {
  if (env.BRIDGE_OCI_E2E_ENVIRONMENT !== "non-production") {
    throw new Error(
      "Refusing OCI E2E: set BRIDGE_OCI_E2E_ENVIRONMENT=non-production only after verifying the target environment",
    );
  }

  const bucket = env.OCI_BUCKET_NAME?.trim();
  if (!bucket || env.BRIDGE_OCI_E2E_CONFIRM_BUCKET?.trim() !== bucket) {
    throw new Error(
      "Refusing OCI E2E: BRIDGE_OCI_E2E_CONFIRM_BUCKET must exactly match OCI_BUCKET_NAME",
    );
  }

  let configuredHost;
  try {
    configuredHost = new URL(env.SUPABASE_URL || env.VITE_SUPABASE_URL || "").host;
  } catch {
    throw new Error("Refusing OCI E2E: a valid SUPABASE_URL or VITE_SUPABASE_URL is required");
  }

  if (
    !configuredHost ||
    env.BRIDGE_OCI_E2E_CONFIRM_SUPABASE_HOST?.trim() !== configuredHost
  ) {
    throw new Error(
      "Refusing OCI E2E: BRIDGE_OCI_E2E_CONFIRM_SUPABASE_HOST must exactly match the configured Supabase host",
    );
  }

  return { bucket, supabaseHost: configuredHost };
}
