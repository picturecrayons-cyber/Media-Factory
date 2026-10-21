import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const PRODUCTION_SUPABASE_REF = "mlmgugivsyoxzdgwkbpu";
const STAGING_SUPABASE_REF = "bbtrosuwisnxacuxvegt";
const SHA_RE = /^[0-9a-f]{40}$/i;

function present(env, key) {
  return typeof env[key] === "string" && env[key].trim().length > 0;
}

function supabaseRef(value) {
  try {
    const host = new URL(value).hostname;
    return host.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1] ?? null;
  } catch {
    return null;
  }
}

function databaseHost(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * A fail-closed preflight for manually dispatched preview-only release-gate runs.
 * It validates environment identity without printing secret values or connecting to services.
 */
export function evaluatePreviewPreflight(env) {
  const checks = [];
  const add = (name, ok, reason) => checks.push({ name, ok: Boolean(ok), reason });

  add(
    "preview mode",
    env.BRIDGE_RELEASE_GATE_ENV === "preview",
    "BRIDGE_RELEASE_GATE_ENV must equal preview",
  );

  const candidate = String(env.BRIDGE_CANDIDATE_SHA ?? "").trim().toLowerCase();
  add("candidate SHA format", SHA_RE.test(candidate), "A full 40-character commit SHA is required");
  if (present(env, "GITHUB_SHA")) {
    add(
      "workflow commit matches candidate",
      String(env.GITHUB_SHA).trim().toLowerCase() === candidate,
      "Dispatch the workflow from the exact candidate commit",
    );
  } else {
    add("workflow commit matches candidate", false, "GITHUB_SHA is missing; run in GitHub Actions");
  }

  const appRef = supabaseRef(env.VITE_SUPABASE_URL ?? "");
  add(
    "preview Supabase project",
    appRef === STAGING_SUPABASE_REF && appRef !== PRODUCTION_SUPABASE_REF,
    "VITE_SUPABASE_URL must point to the configured staging Supabase project",
  );

  const dbHost = databaseHost(env.BRIDGE_PREVIEW_DATABASE_URL ?? "");
  const isKnownProductionOrStagingDb =
    !dbHost ||
    dbHost.includes(PRODUCTION_SUPABASE_REF) ||
    dbHost.includes(STAGING_SUPABASE_REF);
  add(
    "disposable database",
    present(env, "BRIDGE_PREVIEW_DATABASE_URL") &&
      env.BRIDGE_PREVIEW_DATABASE_DISPOSABLE === "true" &&
      !isKnownProductionOrStagingDb,
    "Use a separately provisioned disposable PostgreSQL URL; production and shared staging hosts are forbidden",
  );

  const ociRequired = [
    "OCI_TENANCY_OCID",
    "BRIDGE_PREVIEW_OCI_TENANCY_OCID",
    "OCI_USER_OCID",
    "OCI_PRIVATE_KEY",
    "OCI_REGION",
    "OCI_NAMESPACE",
    "OCI_BUCKET_NAME",
    "BRIDGE_PREVIEW_OCI_BUCKET",
  ];
  add(
    "OCI credentials and explicit preview allowlist",
    ociRequired.every((key) => present(env, key)),
    "Required OCI variables and preview allowlist values must be configured",
  );
  add(
    "OCI tenancy matches preview allowlist",
    present(env, "OCI_TENANCY_OCID") &&
      present(env, "BRIDGE_PREVIEW_OCI_TENANCY_OCID") &&
      env.OCI_TENANCY_OCID.trim() === env.BRIDGE_PREVIEW_OCI_TENANCY_OCID.trim(),
    "OCI_TENANCY_OCID must exactly match BRIDGE_PREVIEW_OCI_TENANCY_OCID",
  );
  add(
    "OCI bucket matches preview allowlist",
    present(env, "OCI_BUCKET_NAME") &&
      present(env, "BRIDGE_PREVIEW_OCI_BUCKET") &&
      env.OCI_BUCKET_NAME.trim() === env.BRIDGE_PREVIEW_OCI_BUCKET.trim(),
    "OCI_BUCKET_NAME must exactly match BRIDGE_PREVIEW_OCI_BUCKET",
  );

  add(
    "Razorpay test mode",
    present(env, "RAZORPAY_KEY_ID") &&
      env.RAZORPAY_KEY_ID.trim().startsWith("rzp_" + "test_") &&
      present(env, "RAZORPAY_KEY_SECRET") &&
      present(env, "RAZORPAY_WEBHOOK_SECRET"),
    "Only Razorpay test-mode credentials may be configured for this preview environment",
  );

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}

function main() {
  const result = evaluatePreviewPreflight(process.env);
  console.log("Crayons Bridge preview release-gate preflight");
  for (const check of result.checks) {
    console.log(`${check.ok ? "PASS" : "BLOCKED"}  ${check.name}`);
    if (!check.ok) console.log(`  ${check.reason}`);
  }
  if (!result.ok) {
    console.error("Preflight blocked. No external service was contacted and no test object was created.");
    process.exitCode = 1;
    return;
  }
  console.log("Preflight passed. This verifies configuration only; it is not release certification.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main();
}
