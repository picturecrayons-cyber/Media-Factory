export function requireExplicitFlag(flag, description) {
  if (!process.argv.includes(flag)) {
    throw new Error(`Blocked: ${description}. Re-run with ${flag} only after the required operator approval.`);
  }
}

export function requireEnvironment(names) {
  const missing = names.filter((name) => !String(process.env[name] ?? "").trim());
  if (missing.length) {
    throw new Error(`missing environment variables: ${missing.join(", ")}`);
  }
}

export function requirePreviewDatabase(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use the postgres:// or postgresql:// protocol.");
  }

  const host = url.hostname.toLowerCase();
  const knownProductionHosts = new Set(["db.mlmgugivsyoxzdgwkbpu.supabase.co"]);
  const productionProjectRef = "mlmgugivsyoxzdgwkbpu";
  if (
    knownProductionHosts.has(host) ||
    host.includes("production") ||
    url.username.toLowerCase().includes(productionProjectRef)
  ) {
    throw new Error("refusing to run against a known production database host or connection user.");
  }
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "preview") {
    throw new Error(`VERCEL_ENV is "${process.env.VERCEL_ENV}", not "preview".`);
  }
  if (process.env.BRIDGE_E2E_ENVIRONMENT !== "preview") {
    throw new Error("set BRIDGE_E2E_ENVIRONMENT=preview only for the approved non-production Preview environment.");
  }

  return url;
}

export function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
