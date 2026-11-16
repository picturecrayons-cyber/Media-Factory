#!/usr/bin/env node
/**
 * Replay the recovered Supabase Production migration source against a fresh,
 * local Supabase stack. This never connects to the Production or staging DB.
 *
 * The historical StreamVista Studio owner mapping migration requires one
 * verified, unmapped Studio profile. Inject a synthetic fixture only in this
 * disposable replay database, in the same transaction as that migration.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(SCRIPT_DIR, "../supabase/migrations");
const DATABASE_URL = process.env.SUPABASE_REPLAY_DATABASE_URL?.trim();
const EXPECTED_MIGRATIONS = 69;
const FIXTURE_MIGRATION =
  "20261113090535_map_verified_streamvista_studio_owner_20261113.sql";
const FIXTURE_USER_ID = "bridge-migration-replay-fixture";
const FIXTURE_EMAIL = "bridge-migration-replay@example.invalid";

if (!DATABASE_URL) {
  throw new Error("SUPABASE_REPLAY_DATABASE_URL is required");
}

// The replay runner must never be able to connect to a hosted database.
// Limit it to the standard local Supabase Postgres endpoint only.
let replayUrl;
try {
  replayUrl = new URL(DATABASE_URL);
} catch {
  throw new Error("SUPABASE_REPLAY_DATABASE_URL must be a valid local PostgreSQL URL");
}
const localReplayHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
if (
  !["postgres:", "postgresql:"].includes(replayUrl.protocol) ||
  !localReplayHosts.has(replayUrl.hostname) ||
  replayUrl.port !== "54322" ||
  replayUrl.pathname !== "/postgres" ||
  decodeURIComponent(replayUrl.username) !== "postgres" ||
  replayUrl.search !== "" ||
  replayUrl.hash !== ""
) {
  throw new Error(
    "Migration replay is restricted to local Supabase Postgres at localhost:54322/postgres; remote databases are forbidden",
  );
}

const names = (await readdir(MIGRATIONS_DIR))
  .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
  .sort((a, b) => a.localeCompare(b));

if (names.length !== EXPECTED_MIGRATIONS) {
  throw new Error(
    `Expected ${EXPECTED_MIGRATIONS} versioned migrations; found ${names.length}`,
  );
}
if (new Set(names).size !== names.length) {
  throw new Error("Duplicate migration filenames detected");
}

const manifestPath = resolve(
  SCRIPT_DIR,
  "../docs/release/bridge-supabase-migration-reconciliation-2026-11-16.md",
);
const manifest = await readFile(manifestPath, "utf8");
const manifestRows = new Map();
for (const line of manifest.split(String.fromCharCode(10))) {
  const cells = line.split("|").map((cell) => cell.trim());
  if (cells.length !== 6) continue;
  const [, version, migrationName, byteText, hashText] = cells;
  if (version.length !== 14 || [...version].some((char) => char < "0" || char > "9")) continue;
  const sha256 = hashText.startsWith("`") && hashText.endsWith("`")
    ? hashText.slice(1, -1)
    : hashText;
  if (sha256.length !== 64 || [...sha256].some((char) => !"0123456789abcdef".includes(char))) {
    throw new Error(`Invalid SHA-256 entry for ${version}`);
  }
  const bytes = Number(byteText);
  if (!Number.isSafeInteger(bytes) || bytes < 1) {
    throw new Error(`Invalid byte count for ${version}`);
  }
  manifestRows.set(`${version}_${migrationName}.sql`, { bytes, sha256 });
}
if (manifestRows.size !== EXPECTED_MIGRATIONS) {
  throw new Error(
    `Expected ${EXPECTED_MIGRATIONS} manifest rows; found ${manifestRows.size}`,
  );
}

for (const name of names) {
  const contents = await readFile(join(MIGRATIONS_DIR, name));
  const expected = manifestRows.get(name);
  if (!expected) throw new Error(`Migration missing from manifest: ${name}`);
  const actualBytes = contents.byteLength;
  const actualSha256 = createHash("sha256").update(contents).digest("hex");
  if (actualBytes !== expected.bytes || actualSha256 !== expected.sha256) {
    throw new Error(
      `Source integrity mismatch for ${name}: ${actualBytes} bytes / ${actualSha256}`,
    );
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
      current_setting('server_version_num') as server_version_num,
      to_regclass('auth.users') is not null as auth_users_ready,
      to_regclass('storage.buckets') is not null as storage_ready,
      to_regclass('supabase_migrations.schema_migrations') is not null as migrations_ledger_ready,
      exists (select 1 from pg_roles where rolname = 'anon') as anon_role_ready,
      exists (select 1 from pg_roles where rolname = 'authenticated') as authenticated_role_ready,
      exists (select 1 from pg_roles where rolname = 'service_role') as service_role_ready,
      exists (select 1 from pg_extension where extname = 'vector') as vector_ready
  `);
  const state = baseline.rows[0];
  console.log("[migration-replay] connected", JSON.stringify(state));
  if (
    !state.auth_users_ready ||
    !state.storage_ready ||
    !state.anon_role_ready ||
    !state.authenticated_role_ready ||
    !state.service_role_ready
  ) {
    throw new Error("Local Supabase base schemas/roles are not ready");
  }

  for (const name of names) {
    const sql = await readFile(join(MIGRATIONS_DIR, name), "utf8");
    await client.query("BEGIN");
    try {
      if (name === FIXTURE_MIGRATION) {
        const current = await client.query(`
          select count(*)::int as count
          from public.bridge_profiles
          where account_type = 'studio'
            and upper(trim(organization_name)) = 'STREAMVISTA OPC PVT LTD'
        `);
        if (current.rows[0].count !== 0) {
          throw new Error(
            "Unexpected StreamVista Studio profile exists before test fixture",
          );
        }
        await client.query(
          `insert into public.bridge_profiles
            (user_id, email, display_name, account_type, organization_name,
             email_verified, internal_role, organization_id)
           values ($1, $2, $3, 'studio', 'STREAMVISTA OPC PVT LTD', true, null, null)`,
          [
            FIXTURE_USER_ID,
            FIXTURE_EMAIL,
            "Migration Replay Fixture",
          ],
        );
      }

      await client.query(sql);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration failed: ${name}: ${error?.message || error}`);
    }
    console.log(`[migration-replay] applied ${name}`);
  }

  const expectedTables = [
    "public.bridge_titles",
    "public.bridge_assets",
    "public.bridge_payments",
    "public.bridge_webhook_events",
    "public.bridge_entitlements",
    "public.bridge_dit_ingest_sessions",
    "public.bridge_dit_storage_objects",
    "public.bridge_dit_copy_verifications",
    "private.bridge_inbound_mail_events",
    "public.bridge_production_assets",
  ];
  const tableCheck = await client.query(
    "select name, to_regclass(name) is not null as exists from unnest($1::text[]) as t(name)",
    [expectedTables],
  );
  const missingTables = tableCheck.rows.filter((row) => !row.exists);
  if (missingTables.length) {
    throw new Error(
      "Missing expected tables after replay: " +
        missingTables.map((row) => row.name).join(", "),
    );
  }

  const fixtureCheck = await client.query(
    `select
       (select count(*)::int from public.bridge_profiles
        where user_id = $1 and email = $2 and email_verified = true
          and organization_id is not null) as mapped_profiles,
       (select count(*)::int from public.bridge_organization_memberships
        where user_id = $1 and membership_role = 'owner' and status = 'active') as owner_memberships`,
    [FIXTURE_USER_ID, FIXTURE_EMAIL],
  );
  if (
    fixtureCheck.rows[0].mapped_profiles !== 1 ||
    fixtureCheck.rows[0].owner_memberships !== 1
  ) {
    throw new Error("The one-time Studio owner mapping did not complete in replay");
  }

  console.log(
    `[migration-replay] PASS: all ${names.length} Production-ledger migrations replayed in a fresh local Supabase stack.`,
  );
} finally {
  client.release();
  await pool.end();
}
