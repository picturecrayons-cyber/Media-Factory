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
  if (state.migrations_ledger_ready) {
    const localLedger = await client.query(
      "select count(*)::int as count from supabase_migrations.schema_migrations",
    );
    if (localLedger.rows[0].count !== 0) {
      throw new Error(
        "Supabase startup auto-applied project migrations before the controlled replay",
      );
    }
  }
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
      // Production contains this legacy trigger helper, but it is not part
      // of the 69-row migration ledger (it predates the recorded history).
      // Recreate that verified baseline object only in the disposable replay DB
      // before the historical migration alters its search_path.
      if (name === "20261006154551_harden_authz_server_only_surfaces_20261006.sql") {
        const baselineHelper = await client.query(`
          select
            to_regclass('public.loop_parental_controls') is not null as table_exists,
            to_regprocedure('public.loop_parental_controls_set_updated_at()') is not null as function_exists
        `);
        if (!baselineHelper.rows[0].table_exists) {
          // Rebuild the verified pre-ledger Production table baseline in this
          // disposable local database only. Never copy the single live row.
          await client.query(`
            create table public.loop_parental_controls (
              user_id uuid primary key references auth.users(id) on delete cascade,
              pin_hash text not null,
              pin_salt text not null,
              failed_attempts integer not null default 0
                constraint loop_parental_controls_failed_attempts_check
                check (failed_attempts >= 0 and failed_attempts <= 5),
              locked_until timestamptz,
              created_at timestamptz not null default now(),
              updated_at timestamptz not null default now()
            );
            create index loop_parental_controls_locked_until_idx
              on public.loop_parental_controls (locked_until);
            alter table public.loop_parental_controls enable row level security;
            revoke all on table public.loop_parental_controls from public, anon, authenticated;
            grant all on table public.loop_parental_controls to postgres, service_role;
          `);
        }
        if (!baselineHelper.rows[0].function_exists) {
          await client.query(`
            create function public.loop_parental_controls_set_updated_at()
            returns trigger
            language plpgsql
            set search_path to 'public', 'pg_temp'
            as $function$
            begin
              new.updated_at = now();
              return new;
            end;
            $function$;
          `);
        }
        await client.query(`
          do $replay$
          begin
            if not exists (
              select 1
              from pg_trigger
              where tgrelid = 'public.loop_parental_controls'::regclass
                and tgname = 'loop_parental_controls_set_updated_at'
                and not tgisinternal
            ) then
              execute 'create trigger loop_parental_controls_set_updated_at before update on public.loop_parental_controls for each row execute function public.loop_parental_controls_set_updated_at()';
            end if;
          end
          $replay$;
        `);
        console.log("[migration-replay] restored verified pre-ledger parental-controls trigger helper in local replay DB");
      }

      // Three server-only tables exist in the Production baseline but are
      // intentionally absent from the 69-row Supabase migration ledger.
      // Recreate their verified, empty schemas only in this disposable local
      // replay DB. The historical deep-clean migration below adds the deny
      // policies, so this fixture enables RLS but does not create policies.
      if (name === "20261006231321_deep_clean_server_only_rls_20261007.sql") {
        const baselineTables = await client.query(`
          select
            to_regclass('public.bridge_creator_notifications') is not null as creator_notifications,
            to_regclass('public.loop_media_migration_queue') is not null as media_migration_queue
        `);

        if (!baselineTables.rows[0].creator_notifications) {
          await client.query(`
            create table public.bridge_creator_notifications (
              id bigserial primary key,
              legacy_user_id integer not null,
              email text not null,
              notification_type text not null,
              title_ids text[] not null,
              status text not null default 'PENDING'
                constraint bridge_creator_notifications_status_check
                check (status in ('PENDING', 'SENT', 'FAILED')),
              provider text not null default 'hostinger_mail',
              provider_message text,
              sent_at timestamptz,
              created_at timestamptz not null default now()
            );
            alter table public.bridge_creator_notifications enable row level security;
          `);
        }

        if (!baselineTables.rows[0].media_migration_queue) {
          await client.query(`
            create table public.loop_media_migration_queue (
              id bigserial primary key,
              legacy_film_id integer not null,
              title_id text not null,
              owner_email text not null,
              asset_kind text not null
                constraint loop_media_migration_queue_asset_kind_check
                check (asset_kind in ('MASTER', 'TRAILER', 'POSTER')),
              source_provider text not null default 'aws_legacy',
              source_key text,
              target_provider text not null default 'supabase_storage',
              target_bucket text not null,
              target_path text,
              status text not null default 'PENDING_REUPLOAD'
                constraint loop_media_migration_queue_status_check
                check (status in ('PENDING_REUPLOAD', 'UPLOADED', 'VERIFIED', 'MISSING_SOURCE_MEDIA', 'FAILED')),
              notes text,
              created_at timestamptz not null default now(),
              updated_at timestamptz not null default now(),
              constraint loop_media_migration_queue_legacy_film_id_asset_kind_key
                unique (legacy_film_id, asset_kind)
            );
            alter table public.loop_media_migration_queue enable row level security;
          `);
        }
        console.log("[migration-replay] restored two verified empty pre-ledger server-only table baselines locally");
      }

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

  const baselineRls = await client.query(`
    select
      c.relname,
      c.relrowsecurity as rls_enabled,
      exists (
        select 1 from pg_policy p
        where p.polrelid = c.oid and p.polname = 'deny_client_access'
      ) as deny_policy_exists
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any($1::text[])
    order by c.relname
  `, [["bridge_creator_notifications", "loop_media_migration_queue", "loop_parental_controls"]]);
  if (
    baselineRls.rows.length !== 3 ||
    baselineRls.rows.some((row) => !row.rls_enabled || !row.deny_policy_exists)
  ) {
    throw new Error(
      "Pre-ledger server-only baseline RLS verification failed: " +
        JSON.stringify(baselineRls.rows),
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
