import pgConnectionString from "pg-connection-string";

const { parse: parsePgConnectionString } = pgConnectionString;

const TARGET_OVERRIDE_PARAMETERS = new Set([
  "host", "hostaddr", "port", "user", "username", "database", "dbname",
  "service", "servicefile",
]);
const TARGET_OPTIONS = new Set([
  "host", "hostaddr", "port", "user", "username", "database", "databaseName",
  "service", "servicefile", "connectionString",
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
  const projectMatch = supabaseUrl.hostname.toLowerCase().match(/^([a-z0-9]{20})\\.supabase\\.co$/);
  if (!projectMatch || projectMatch[1] !== expectedRef) {
    throw new Error("Supabase API URL does not identify the expected Production project.");
  }
  if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
    throw new Error("Production database binding must use postgres:// or postgresql://.");
  }

  // Reject routing overrides, then validate the same parsed connection parameters
  // that node-postgres uses for its actual connection.
  for (const key of databaseUrl.searchParams.keys()) {
    if (TARGET_OVERRIDE_PARAMETERS.has(key.toLowerCase())) {
      throw new Error(`PostgreSQL connection string contains a forbidden target override parameter: ${key}.`);
    }
  }

  let effective;
  try {
    effective = parsePgConnectionString(databaseUrlValue);
  } catch {
    throw new Error("Production PostgreSQL connection string could not be parsed safely.");
  }

  const host = typeof effective.host === "string" ? effective.host.toLowerCase() : "";
  const username = typeof effective.user === "string" ? effective.user : "";
  const databaseName = typeof effective.database === "string" ? effective.database : "";
  const port = Number(effective.port || 5432);
  if (databaseName !== "postgres") {
    throw new Error("Production database binding must target the postgres database.");
  }
  const directHostMatches = host === `db.${expectedRef}.supabase.co` && username === "postgres" && port === 5432;
  const poolerHostMatches = /^aws-\\d+-[a-z0-9-]+\\.pooler\\.supabase\\.com$/.test(host);
  const poolerIdentityMatches = poolerHostMatches && username === `postgres.${expectedRef}` && (port === 5432 || port === 6543);
  if (!directHostMatches && !poolerIdentityMatches) {
    throw new Error("Effective PostgreSQL connection host, username, port, or database does not match the expected Production target; refusing to connect.");
  }
  return true;
}

export function createGuardedProductionPool(Pool, supabaseUrl, databaseUrl, expectedRef, options = {}) {
  assertProductionDatabaseTarget(supabaseUrl, databaseUrl, expectedRef);
  for (const key of Object.keys(options)) {
    if (TARGET_OPTIONS.has(key)) {
      throw new Error(`PostgreSQL pool options cannot override the guarded Production target: ${key}.`);
    }
  }
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
  return /\\(404\\)/.test(String(message)) ? "NOT_FOUND" : "ERROR";
}
