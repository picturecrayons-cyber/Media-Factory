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

  const ssl =
    process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false };
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, ssl });
  const client = await pool.connect();
  try {
    // Supabase tracks applied migrations in supabase_migrations.schema_migrations.
    // This legacy runner uses a separate _migrations ledger and cannot safely infer
    // which numbered files have already been applied to a Supabase project. Fail
    // closed before any DDL rather than replaying the full historical migration set.
    const historyCheck = await client.query(
      "SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS has_supabase_history",
    );
    if (historyCheck.rows[0]?.has_supabase_history) {
      throw new Error(
        "Supabase migration history detected. Refusing to use the legacy _migrations runner; use the approved Supabase migration workflow instead. No migration was applied.",
      );
    }

    await client.query(
      "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = (await client.query("SELECT name FROM _migrations")).rows.map(
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
