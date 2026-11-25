#!/usr/bin/env node
/**
 * Replay the exact SQL statement arrays recovered from the Crayons Testing
 * Supabase migration ledger. This runner is hard-restricted to the disposable
 * local Supabase PostgreSQL endpoint and never accepts hosted DB URLs.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE_DIR = resolve(ROOT, "supabase/staging-recovery");
const EXPECTED_RECORDS = 98;
const DATABASE_URL = process.env.TESTING_LEDGER_REPLAY_DATABASE_URL?.trim();

if (!DATABASE_URL) throw new Error("TESTING_LEDGER_REPLAY_DATABASE_URL is required");

let replayUrl;
try {
  replayUrl = new URL(DATABASE_URL);
} catch {
  throw new Error("TESTING_LEDGER_REPLAY_DATABASE_URL must be a valid local PostgreSQL URL");
}
if (
  !["postgres:", "postgresql:"].includes(replayUrl.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(replayUrl.hostname) ||
  replayUrl.port !== "55432" ||
  replayUrl.pathname !== "/postgres" ||
  decodeURIComponent(replayUrl.username) !== "postgres" ||
  replayUrl.search !== "" ||
  replayUrl.hash !== ""
) {
  throw new Error(
    "Testing-ledger replay is restricted to local Supabase Postgres at localhost:55432/postgres; hosted databases are forbidden",
  );
}

const records = [];
for (let part = 1; part <= 10; part += 1) {
  const filename = `ledger-statements-2026-11-25-part-${String(part).padStart(2, "0")}.json`;
  const archive = JSON.parse(await readFile(join(ARCHIVE_DIR, filename), "utf8"));
  if (
    archive.source_project !== "jbymleftneggcgutlcqu" ||
    archive.source_table !== "supabase_migrations.schema_migrations" ||
    archive.retrieved_at !== "2026-11-25"
  ) {
    throw new Error(`Unexpected archive provenance metadata: ${filename}`);
  }
  records.push(...archive.records);
}

if (records.length !== EXPECTED_RECORDS) {
  throw new Error(`Expected ${EXPECTED_RECORDS} recovered migrations; found ${records.length}`);
}
const versions = records.map((record) => record.version);
if (new Set(versions).size !== EXPECTED_RECORDS) {
  throw new Error("Duplicate Testing migration versions found in the recovery archive");
}
for (let i = 1; i < versions.length; i += 1) {
  if (versions[i - 1] >= versions[i]) {
    throw new Error("Testing migration archive is not strictly ordered by version");
  }
}
for (const record of records) {
  if (
    !/^\d{14}$/.test(record.version) ||
    typeof record.name !== "string" ||
    !Array.isArray(record.statements) ||
    record.statements.length !== 1 ||
    record.statement_count !== record.statements.length
  ) {
    throw new Error(`Invalid recovered migration record: ${record.version}`);
  }
  const reconstructed = record.statements.join("\n;\n");
  const actualHash = createHash("sha256").update(reconstructed, "utf8").digest("hex");
  if (actualHash !== record.sha256) {
    throw new Error(`Recovered SQL fingerprint mismatch: ${record.version}`);
  }
  if (!reconstructed.trim()) {
    throw new Error(`Empty recovered SQL body: ${record.version}`);
  }
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10_000,
  ssl: false,
});
const client = await pool.connect();

try {
  const baseline = await client.query(`
    select
      current_database() as database_name,
      current_setting('server_version_num')::int as server_version_num,
      to_regclass('auth.users') is not null as auth_users_ready,
      to_regclass('storage.buckets') is not null as storage_ready,
      to_regclass('supabase_migrations.schema_migrations') is not null as migrations_ledger_ready,
      exists (select 1 from pg_roles where rolname = 'anon') as anon_role_ready,
      exists (select 1 from pg_roles where rolname = 'authenticated') as authenticated_role_ready,
      exists (select 1 from pg_roles where rolname = 'service_role') as service_role_ready
  `);
  const state = baseline.rows[0];
  console.log("[testing-ledger-replay] connected", JSON.stringify(state));
  if (
    state.server_version_num < 170000 ||
    state.server_version_num >= 180000 ||
    !state.auth_users_ready ||
    !state.storage_ready ||
    !state.migrations_ledger_ready ||
    !state.anon_role_ready ||
    !state.authenticated_role_ready ||
    !state.service_role_ready
  ) {
    throw new Error("Disposable PostgreSQL 17 Supabase base schemas/roles are not ready");
  }

  const ledger = await client.query(
    "select count(*)::int as count from supabase_migrations.schema_migrations",
  );
  if (ledger.rows[0].count !== 0) {
    throw new Error("Local Supabase startup applied migrations before controlled Testing-ledger replay");
  }

  await client.query(`
    create temporary table testing_ledger_replay_audit (
      version text primary key,
      migration_name text not null,
      sha256 text not null,
      applied_at timestamptz not null default now()
    ) on commit preserve rows
  `);

  for (const record of records) {
    await client.query("begin");
    try {
      await client.query(record.statements[0]);
      await client.query(
        "insert into pg_temp.testing_ledger_replay_audit (version, migration_name, sha256) values ($1, $2, $3)",
        [record.version, record.name, record.sha256],
      );
      await client.query("commit");
      console.log("[testing-ledger-replay] applied", record.version, record.name);
    } catch (error) {
      await client.query("rollback");
      throw new Error(
        `Testing migration replay failed at ${record.version} (${record.name}): ${error.message}`,
        { cause: error },
      );
    }
  }

  const result = await client.query(`
    select
      (select count(*)::int from pg_temp.testing_ledger_replay_audit) as replayed_migrations,
      (select count(*)::int from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') as public_tables,
      (select count(*)::int from pg_policy p join pg_class c on c.oid = p.polrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public') as public_policies,
      (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as public_functions,
      (select count(*)::int from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal) as public_triggers
  `);
  const summary = result.rows[0];
  if (summary.replayed_migrations !== EXPECTED_RECORDS) {
    throw new Error(`Expected ${EXPECTED_RECORDS} replayed migrations; got ${summary.replayed_migrations}`);
  }
  console.log("[testing-ledger-replay] PASS", JSON.stringify(summary));
} finally {
  client.release();
  await pool.end();
}
