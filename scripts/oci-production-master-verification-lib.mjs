const TARGET_OVERRIDE_PARAMETERS = new Set([
  "host", "hostaddr", "port", "user", "username", "database", "dbname",
  "service", "servicefile",
]);

export function assertProductionDatabaseTarget(supabaseUrlValue, databaseUrlValue, expectedRef) {
  let supabaseUrl;
  let databaseUrl;
  try {
    supabaseUrl = new URL(supabaseUrlValue);
    databaseUrl = new URL(databaseUrlValue);
  } catch {
    throw new Error("Production Supabase and PostgreSQL URLs must both be valid URLs.");
  }
  const projectMatch = supabaseUrl.hostname.toLowerCase().match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (!projectMatch || projectMatch[1] !== expectedRef) {
    throw new Error("Supabase API URL does not identify the expected Production project.");
  }
  if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
    throw new Error("Production database binding must use postgres:// or postgresql://.");
  }

  // node-postgres parses connection-string query parameters after URL parsing.
  // Reject every parameter capable of replacing the authority's routing identity.
  for (const key of databaseUrl.searchParams.keys()) {
    if (TARGET_OVERRIDE_PARAMETERS.has(key.toLowerCase())) {
      throw new Error(`PostgreSQL connection string contains a forbidden target override parameter: ${key}.`);
    }
  }

  const host = databaseUrl.hostname.toLowerCase();
  let username;
  let databaseName;
  try {
    username = decodeURIComponent(databaseUrl.username);
    databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
  } catch {
    throw new Error("Production database binding has invalid encoded credentials or database name.");
  }
  if (databaseName !== "postgres") {
    throw new Error("Production database binding must target the postgres database.");
  }
  const directHostMatches = host === `db.${expectedRef}.supabase.co` && username === "postgres";
  const poolerHostMatches = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host);
  const poolerIdentityMatches = poolerHostMatches && username === `postgres.${expectedRef}`;
  if (!directHostMatches && !poolerIdentityMatches) {
    throw new Error("PostgreSQL connection does not prove the expected Supabase Production host and username; refusing to connect.");
  }
  return true;
}

export function createGuardedProductionPool(Pool, supabaseUrl, databaseUrl, expectedRef, options = {}) {
  assertProductionDatabaseTarget(supabaseUrl, databaseUrl, expectedRef);
  return new Pool({ connectionString: databaseUrl, ...options });
}

export function compareObjectSizes(databaseByteSize, actualByteSize) {
  if (databaseByteSize === null || databaseByteSize === undefined) {
    return { status: "UNRECORDED", matches: false };
  }
  const expected = Number(databaseByteSize);
  if (!Number.isSafeInteger(expected) || !Number.isSafeInteger(actualByteSize) || expected < 0 || actualByteSize < 0) {
    return { status: "INVALID_SIZE", matches: false };
  }
  return expected === actualByteSize
    ? { status: "MATCH", matches: true }
    : { status: "MISMATCH", matches: false };
}

export function isCanonicalMasterVerified(masterKey, objects) {
  if (typeof masterKey !== "string" || !masterKey) return false;
  return objects.some((object) => object.objectKey === masterKey && object.result === "EXISTS" && object.sizeStatus === "MATCH");
}

export function classifyObjectError(message) {
  return /\(404\)/.test(String(message)) ? "NOT_FOUND" : "ERROR";
}
