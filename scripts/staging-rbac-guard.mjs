export const REQUIRED_PROJECT_REF = "jbymleftneggcgutlcqu";
export const FORBIDDEN_PROJECT_REFS = new Set([
  "mlmgugivsyoxzdgwkbpu",
  "bbtrosuwisnxacuxvegt",
]);

export function requireStagingOnlyEnvironment(env = process.env) {
  const projectRef = env.BRIDGE_STAGING_PROJECT_REF;
  const supabaseUrlText = env.BRIDGE_STAGING_SUPABASE_URL;
  const databaseUrlText = env.BRIDGE_STAGING_DATABASE_URL;

  if (FORBIDDEN_PROJECT_REFS.has(projectRef)) {
    throw new Error(`Refusing to run: project ref ${projectRef} is explicitly forbidden for this staging smoke test.`);
  }
  if (projectRef !== REQUIRED_PROJECT_REF) {
    throw new Error(`Refusing to run: BRIDGE_STAGING_PROJECT_REF must equal ${REQUIRED_PROJECT_REF}.`);
  }

  let supabaseUrl;
  try {
    supabaseUrl = new URL(supabaseUrlText ?? "");
  } catch {
    throw new Error("Refusing to run: BRIDGE_STAGING_SUPABASE_URL must be a valid HTTPS URL.");
  }
  if (supabaseUrl.protocol !== "https:" || supabaseUrl.hostname !== `${REQUIRED_PROJECT_REF}.supabase.co`) {
    throw new Error("Refusing to run: BRIDGE_STAGING_SUPABASE_URL must point to the exact Testing project over HTTPS.");
  }

  if (!databaseUrlText) {
    throw new Error("Set BRIDGE_STAGING_DATABASE_URL to the Testing-only Postgres connection string.");
  }

  let databaseUrl;
  try {
    databaseUrl = new URL(databaseUrlText);
  } catch {
    throw new Error("Refusing to run: BRIDGE_STAGING_DATABASE_URL must be a valid Postgres URL.");
  }
  if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol)) {
    throw new Error("Refusing to run: database URL must use the Postgres protocol.");
  }

  const directTestingHost = databaseUrl.hostname === `db.${REQUIRED_PROJECT_REF}.supabase.co`;
  const testingPooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(databaseUrl.hostname) &&
    decodeURIComponent(databaseUrl.username) === `postgres.${REQUIRED_PROJECT_REF}`;
  if (!directTestingHost && !testingPooler) {
    throw new Error("Refusing to run: database host/user does not prove the exact Testing project. Production, obsolete staging, and unrecognized hosts are blocked.");
  }
  return databaseUrlText;
}
