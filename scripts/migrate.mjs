#!/usr/bin/env node
/**
 * Deploy-time database migrator (node-postgres, `pg`).
 *
 * Uses DATABASE_URL when explicitly configured, otherwise the Vercel Supabase
 * integration's POSTGRES_URL. Blank values are treated as absent.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { pendingMigrations } from "./migration-plan.mjs";
import { collectRepositoryMigrationInventory, reconcileMigrationHistory } from "./migration-reconciliation.mjs";

const readEnv = (key) => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};
const normalizePostgresUrl = (value) => {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return value;
  }
};
const databaseUrl = normalizePostgresUrl(
  readEnv("DATABASE_URL") ??
    readEnv("POSTGRES_URL") ??
    readEnv("SUPABASE_DB_URL") ??
    readEnv("SUPABASE_DATABASE_URL"),
);
if (!databaseUrl) {
  console.log(
    "[migrate] DATABASE_URL/POSTGRES_URL not set — skipping (the local PGLite fallback migrates itself).",
  );
  process.exit(0);
}

/**
 * Remote migration writes are allowed only against the explicitly approved
 * Bridge Testing DB. Production and unknown remote targets fail closed.
 * Disposable localhost PostgreSQL is permitted only inside GitHub Actions.
 */
function assertMigrationTarget(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Refusing to migrate: database URL is invalid."); }
  const localCi = readEnv("CI") === "true" &&
    ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (localCi) return;
  const projectRef = "jbymleftneggcgutlcqu";
  const target = readEnv("BRIDGE_DB_TARGET")?.toUpperCase();
  const configuredRef = readEnv("BRIDGE_STAGING_PROJECT_REF");
  const supabaseUrl = readEnv("BRIDGE_STAGING_SUPABASE_URL") ??
    readEnv("SUPABASE_URL") ?? readEnv("VITE_SUPABASE_URL");
  const hostMatches = url.hostname === `db.${projectRef}.supabase.co`;
  const poolerMatches = url.hostname.endsWith(".pooler.supabase.com") &&
    decodeURIComponent(url.username).includes(projectRef);
  let apiMatches = false;
  try { apiMatches = new URL(supabaseUrl).hostname === `${projectRef}.supabase.co`; } catch {}
  if (target !== "STAGING" || configuredRef !== projectRef ||
      (!hostMatches && !poolerMatches) || !apiMatches) {
    throw new Error("Refusing remote migration: explicit STAGING target, exact approved project ref, matching Supabase API URL and project-bound database host are required. Production and unknown targets are blocked.");
  }
}
assertMigrationTarget(databaseUrl);

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function main() {
  let entries;
  try {
    entries = await readdir(migrationsDir);
  } catch {
    console.log("[migrate] no migrations/ directory — nothing to do.");
    return;
  }
  if (pendingMigrations(entries, []).length === 0) {
    console.log("[migrate] no migrations — nothing to do.");
    return;
  }

  // Validate the database's migration bookkeeping before creating or changing
  // any ledger. Supabase's ledger is not interchangeable with this app's
  // basename-keyed _migrations table. If only the Supabase ledger exists,
  // abort rather than replaying every repository migration as "pending".
  const ssl =
    process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: true };
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, ssl });
  const client = await pool.connect();
  try {
    const ledgerState = await client.query(`
      SELECT
        to_regclass('public._migrations') IS NOT NULL AS app_ledger_exists,
        to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS supabase_ledger_exists
    `);
    const { app_ledger_exists: appLedgerExists, supabase_ledger_exists: supabaseLedgerExists } =
      ledgerState.rows[0] ?? {};
    if (supabaseLedgerExists) {
      const supabaseRows = await client.query(
        "SELECT version, name, statements FROM supabase_migrations.schema_migrations ORDER BY version",
      );
      const appRows = appLedgerExists
        ? await client.query("SELECT name FROM public._migrations ORDER BY name")
        : { rows: [] };
      const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
      // Reconciliation inventories both roots; pendingMigrations above still
      // applies only the original top-level migrations/ entries.
      const repositoryMigrations = await collectRepositoryMigrationInventory(repositoryRoot);
      const reconciliation = reconcileMigrationHistory({
        repositoryMigrations,
        supabaseMigrations: supabaseRows.rows,
        appMigrationNames: appRows.rows.map((row) => row.name),
      });
      console.log(
        "[migrate] provenance audit: " + reconciliation.mappedNames.length + "/" + supabaseRows.rows.length +
        " exact SQL matches; " + reconciliation.blockers.length + " blocker(s).",
      );
      if (!appLedgerExists) {
        reconciliation.blockers.unshift(
          "Supabase migration history exists but the app _migrations ledger is absent; no ledger will be synthesized from a partial crosswalk.",
        );
        reconciliation.compatible = false;
      }
      if (!reconciliation.compatible) {
        for (const blocker of reconciliation.blockers) console.error("[migrate] BLOCKED: " + blocker);
        throw new Error("Migration provenance is incomplete. No migration SQL was applied.");
      }
    }
    if (!appLedgerExists) {
      await client.query(
        "CREATE TABLE IF NOT EXISTS public._migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
      );
    }
    const applied = (await client.query("SELECT name FROM public._migrations")).rows.map(
      (r) => r.name,
    );

    let count = 0;
    for (const { name } of pendingMigrations(entries, applied)) {
      const text = await readFile(join(migrationsDir, name), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(text);
        await client.query("INSERT INTO _migrations (name) VALUES ($1)", [name]);
        await client.query("COMMIT");
      } catch (err) {
        console.error(`[migrate] error applying ${name}`);
        try {
          await client.query("ROLLBACK");
        } catch {
          // Keep the original error.
        }
        throw err;
      }
      console.log(`[migrate] applied ${name}`);
      count += 1;
    }
    console.log(count ? `[migrate] done — ${count} migration(s) applied.` : "[migrate] up to date.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err?.message || err);
  for (const key of ["code", "detail", "hint", "position", "where"]) {
    if (err?.[key] != null) console.error(`[migrate]   ${key}: ${err[key]}`);
  }
  process.exit(1);
});
