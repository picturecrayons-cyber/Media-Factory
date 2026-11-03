export const APPROVED_STAGING_PROJECT_REF = "jbymleftneggcgutlcqu";

const REQUIRED_KEYS = [
  "OCI_TENANCY_OCID",
  "OCI_USER_OCID",
  "OCI_FINGERPRINT",
  "OCI_PRIVATE_KEY",
  "OCI_REGION",
  "OCI_NAMESPACE",
  "OCI_BUCKET_NAME",
  "DATABASE_URL",
  "BRIDGE_E2E_ASSET_ID",
  "BRIDGE_E2E_TITLE_ID",
];

export function validateStorageE2EConfig(env) {
  const missing = [...REQUIRED_KEYS, "BRIDGE_E2E_ENVIRONMENT", "BRIDGE_E2E_ALLOW_DB_MUTATION",
    "BRIDGE_E2E_ALLOW_OCI_MUTATION", "BRIDGE_E2E_EXPECTED_SUPABASE_REF"]
    .filter((key) => !String(env[key] ?? "").trim());
  if (missing.length) return { ok: false, reason: `missing required staging configuration: ${missing.join(", ")}` };

  if (env.BRIDGE_E2E_ENVIRONMENT !== "staging") {
    return { ok: false, reason: "only the explicitly designated STAGING environment is permitted" };
  }
  if (env.BRIDGE_E2E_ALLOW_DB_MUTATION !== "YES" || env.BRIDGE_E2E_ALLOW_OCI_MUTATION !== "YES") {
    return { ok: false, reason: "explicit manual approval for STAGING DB and OCI mutation is required" };
  }
  if (env.BRIDGE_E2E_EXPECTED_SUPABASE_REF !== APPROVED_STAGING_PROJECT_REF) {
    return { ok: false, reason: "unexpected Supabase project reference" };
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    return { ok: false, reason: "STAGING database URL is invalid" };
  }
  if (databaseUrl.hostname.toLowerCase() !== `db.${APPROVED_STAGING_PROJECT_REF}.supabase.co`) {
    return { ok: false, reason: "database host is not the approved STAGING / TESTING DB" };
  }
  if (!/(?:^|[-_])(staging|test)(?:[-_]|$)/i.test(env.OCI_BUCKET_NAME)) {
    return { ok: false, reason: "OCI bucket name must identify a dedicated staging/test bucket" };
  }

  return { ok: true, reason: "approved STAGING target configuration" };
}

export function validateStorageE2EAsset(asset, expectedTitleId) {
  if (!asset) return { ok: false, reason: "E2E asset not found" };
  if (asset.title_id !== expectedTitleId) return { ok: false, reason: "asset is outside the approved synthetic title" };
  if (!String(asset.title_name ?? "").trim().toUpperCase().startsWith("INTERNAL TEST ONLY")) {
    return { ok: false, reason: "title is not marked INTERNAL TEST ONLY" };
  }
  if (asset.kind !== "poster") return { ok: false, reason: "only a synthetic poster asset may be used" };
  if (!["e2e/", "test/", "staging/"].some((prefix) => String(asset.s3_key ?? "").toLowerCase().startsWith(prefix))) {
    return { ok: false, reason: "asset key is outside the dedicated E2E object prefix" };
  }
  if (asset.byte_size !== null) return { ok: false, reason: "asset is already verified; provide a fresh pending asset" };
  if (!["DRAFT", "UPLOADING", "PREPARING"].includes(asset.status)) {
    return { ok: false, reason: "synthetic title is not in an uploadable state" };
  }
  if (!asset.created_by || asset.created_by !== asset.owner_user_id) {
    return { ok: false, reason: "E2E asset must belong to the synthetic title owner" };
  }
  return { ok: true, reason: "approved synthetic STAGING asset" };
}
