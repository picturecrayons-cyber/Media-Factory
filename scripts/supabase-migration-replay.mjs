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
const EXPECTED_MIGRATIONS = 70;
// Explicit unmerged migrations added by this Platform Super Admin PR. The
// recovered Production-ledger set remains independently pinned by its manifest.
const PENDING_MIGRATIONS = new Set([
  "20261124212758_bridge_service_request_backend_routing.sql",
  "20261125093000_platform_super_admin_account_type.sql",
  "20261125094500_loop_admin_featured_audit.sql",
  "20261125101500_public_loop_catalog_publishable_rpc.sql",
]);
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
  replayUrl.port !== "55432" ||
  replayUrl.pathname !== "/postgres" ||
  decodeURIComponent(replayUrl.username) !== "postgres" ||
  replayUrl.search !== "" ||
  replayUrl.hash !== ""
) {
  throw new Error(
    "Migration replay is restricted to local Supabase Postgres at localhost:55432/postgres; remote databases are forbidden",
  );
}

const names = (await readdir(MIGRATIONS_DIR))
  .filter((name) => /^\d{14}_[a-z0-9_]+\.sql$/.test(name))
  .sort((a, b) => a.localeCompare(b));

const recoveredNames = names.filter((name) => !PENDING_MIGRATIONS.has(name));
const pendingNames = names.filter((name) => PENDING_MIGRATIONS.has(name));
if (
  names.length !== EXPECTED_MIGRATIONS + PENDING_MIGRATIONS.size ||
  recoveredNames.length !== EXPECTED_MIGRATIONS ||
  pendingNames.length !== PENDING_MIGRATIONS.size
) {
  throw new Error(
    `Expected ${EXPECTED_MIGRATIONS} recovered migrations plus ${PENDING_MIGRATIONS.size} explicit pending migrations; found ${names.length}`,
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
  if (PENDING_MIGRATIONS.has(name)) continue;
  const contents = await readFile(join(MIGRATIONS_DIR, name));
  const expected = manifestRows.get(name);
  if (!expected) throw new Error(`Recovered migration missing from manifest: ${name}`);
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

      // The Story/Concept module predates the 69-row migration ledger.
      // Production has three rows in bridge_story_concept_submissions; recreate
      // only the schema/policies/grants locally and never copy those records.
      if (name === "20261113090257_bridge_story_concept_nonrow_privileges_20261113.sql") {
        await client.query(`
          alter table public.bridge_titles
            add column if not exists submission_type text
            check (submission_type in ('finished_film', 'story_concept'))
            default 'finished_film';

          create table if not exists public.bridge_story_concept_submissions (
            id uuid primary key default gen_random_uuid(),
            title_id text not null unique
              references public.bridge_titles(id) on delete cascade,
            logline text,
            synopsis text,
            treatment_url text,
            screenplay_url text,
            genre text[] default '{}',
            estimated_budget_range text,
            target_platforms text[] default '{}',
            curation_status text not null default 'PENDING'
              check (curation_status in (
                'PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'INTRODUCED_TO_BUYERS'
              )),
            admin_notes text,
            introduced_to_buyers_at timestamptz,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          );
          create index if not exists bridge_story_concept_curation_idx
            on public.bridge_story_concept_submissions (curation_status, created_at desc);
          alter table public.bridge_story_concept_submissions enable row level security;
          revoke all on table public.bridge_story_concept_submissions from public, anon, authenticated;
          grant select, insert, update, delete, maintain
            on table public.bridge_story_concept_submissions to anon, authenticated;
          grant all on table public.bridge_story_concept_submissions to postgres, service_role;

          create table if not exists public.bridge_buyer_interest (
            id uuid primary key default gen_random_uuid(),
            concept_submission_id uuid not null
              references public.bridge_story_concept_submissions(id) on delete cascade,
            buyer_user_id text not null,
            interest_level text not null default 'VIEWED'
              check (interest_level in ('VIEWED', 'INTERESTED', 'REQUESTED_MATERIALS', 'PASSED')),
            notes text,
            created_at timestamptz not null default now()
          );
          create index if not exists bridge_buyer_interest_concept_idx
            on public.bridge_buyer_interest (concept_submission_id, created_at desc);
          alter table public.bridge_buyer_interest enable row level security;
          revoke all on table public.bridge_buyer_interest from public, anon, authenticated;
          grant all on table public.bridge_buyer_interest to postgres, service_role;
        `);

        await client.query(`
          do $replay$
          begin
            if not exists (
              select 1 from pg_policy
              where polrelid = 'public.bridge_story_concept_submissions'::regclass
                and polname = 'Deny anonymous public access'
            ) then
              create policy "Deny anonymous public access"
                on public.bridge_story_concept_submissions
                for all to anon using (false);
            end if;
            if not exists (
              select 1 from pg_policy
              where polrelid = 'public.bridge_story_concept_submissions'::regclass
                and polname = 'bridge_story_concept_submissions_owner_only'
            ) then
              create policy bridge_story_concept_submissions_owner_only
                on public.bridge_story_concept_submissions
                for all to authenticated
                using (exists (
                  select 1
                  from public.bridge_titles t
                  join public.bridge_loop_identity_links l
                    on l.bridge_user_id = t.owner_user_id
                  where t.id = bridge_story_concept_submissions.title_id
                    and l.auth_user_id = (select auth.uid())
                ))
                with check (exists (
                  select 1
                  from public.bridge_titles t
                  join public.bridge_loop_identity_links l
                    on l.bridge_user_id = t.owner_user_id
                  where t.id = bridge_story_concept_submissions.title_id
                    and l.auth_user_id = (select auth.uid())
                ));
            end if;
          end
          $replay$;
        `);
        console.log("[migration-replay] restored Story/Concept pre-ledger schema and RLS baseline locally; no Production rows copied");
      }

      // The Delivery Desk table predates the 69-row migration ledger.
      // Recreate its empty schema and existing internal-only RLS policy locally;
      // the Production table currently has zero rows, and no live data is copied.
      if (name === "20261114135437_bridge_delivery_job_ownership_20261114.sql") {
        await client.query(`
          create table public.bridge_delivery_jobs (
            id uuid primary key default gen_random_uuid(),
            title_id text not null
              references public.bridge_titles(id) on delete cascade,
            job_type text not null
              constraint bridge_delivery_jobs_job_type_check
              check (job_type in ('dubbing', 'loudness', 'imf', 'dcp', 'human_qc', 'localization')),
            status text not null default 'requested'
              constraint bridge_delivery_jobs_status_check
              check (status in ('requested', 'in_progress', 'completed', 'failed', 'approved')),
            assigned_vendor text,
            delivery_receipt_url text,
            admin_sign_off boolean not null default false,
            created_at timestamptz not null default now(),
            updated_at timestamptz not null default now()
          );
          create index bridge_delivery_jobs_status_idx
            on public.bridge_delivery_jobs (status);
          create index bridge_delivery_jobs_title_id_idx
            on public.bridge_delivery_jobs (title_id);
          alter table public.bridge_delivery_jobs enable row level security;
          revoke all on table public.bridge_delivery_jobs from public;
          grant all on table public.bridge_delivery_jobs to anon, authenticated, postgres, service_role;
          create policy bridge_delivery_jobs_internal_only
            on public.bridge_delivery_jobs
            for all to authenticated
            using ((select private.bridge_is_internal()))
            with check ((select private.bridge_is_internal()));
        `);
        console.log("[migration-replay] restored empty Delivery Desk pre-ledger schema and internal-only RLS baseline locally; no Production rows copied");
      }

      // Production has this read-only LOOP catalogue RPC, but it is absent
      // from the recovered migration ledger. Recreate the verified pre-ledger
      // function only in the disposable replay database before its hardening
      // migration. Preserve SECURITY INVOKER; never elevate a public RPC.
      if (name === "20261125101500_public_loop_catalog_publishable_rpc.sql") {
        const existingCatalog = await client.query(
          "select to_regprocedure('public.public_loop_catalog()') is not null as exists",
        );
        if (!existingCatalog.rows[0].exists) {
          await client.query(`
            create function public.public_loop_catalog()
            returns table(
              id text,
              bridge_title_id text,
              slug text,
              title text,
              synopsis text,
              description text,
              content_type text,
              language text,
              year integer,
              duration_minutes integer,
              maturity_rating text,
              director text,
              is_original boolean,
              original_badge text,
              status text,
              listed boolean,
              published boolean,
              featured boolean,
              access_tier text,
              tvod_rental_price numeric,
              poster_available boolean,
              backdrop_available boolean,
              trailer_available boolean
            )
            language sql
            stable
            set search_path to ''
            as $function$
              select
                l.id::text,
                l.bridge_title_id,
                l.slug,
                l.title,
                l.synopsis,
                l.description,
                coalesce(l.content_type, 'Film'),
                l.language,
                l.year,
                l.duration_minutes,
                l.maturity_rating,
                null::text as director,
                false as is_original,
                null::text as original_badge,
                lower(l.status),
                l.listed,
                l.published,
                l.featured,
                l.access_tier,
                l.tvod_rental_price,
                nullif(l.poster_path, '') is not null,
                nullif(l.backdrop_path, '') is not null,
                nullif(l.trailer_path, '') is not null
              from public.loop_titles as l
              inner join public.bridge_loop_publications as p
                on p.loop_title_id = l.id
               and p.bridge_title_id = l.bridge_title_id
              where lower(p.authorization_status) = 'authorized'
                and p.approved_at is not null
                and p.revoked_at is null
                and p.window_start is not null
                and p.window_end is not null
                and p.window_start <= now()
                and p.window_end > now()
                and p.territories @> array['WORLDWIDE']::text[]
                and p.languages @> array[l.language]::text[]
                and p.exploitation_models @> array[l.access_tier]::text[]
                and lower(l.status) in ('approved', 'published')
                and l.listed is true
                and l.published is true
              order by l.created_at desc;
            $function$
          `);
          console.log("[migration-replay] restored verified pre-ledger public LOOP catalogue RPC locally as SECURITY INVOKER");
        }
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
      if (name === "20261125101500_public_loop_catalog_publishable_rpc.sql") {
        const catalogSecurity = await client.query(`
          select
            p.prosecdef as security_definer,
            coalesce(p.proconfig, array[]::text[]) @> array['search_path=""']::text[] as empty_search_path
          from pg_proc p
          where p.oid = 'public.public_loop_catalog()'::regprocedure
        `);
        if (
          catalogSecurity.rows.length !== 1 ||
          catalogSecurity.rows[0].security_definer !== true ||
          catalogSecurity.rows[0].empty_search_path !== true
        ) {
          throw new Error(
            "Public LOOP catalogue RPC must be SECURITY DEFINER with an empty search_path",
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`Migration failed: ${name}: ${error?.message || error}`);
    }
    console.log(`[migration-replay] applied ${name}`);
  }

  // Production's current Bridge Data API security baseline is not fully
  // represented by the 69-row migration ledger. Recreate it locally after
  // replay from read-only Production catalog evidence only.
  await client.query(`
    do $bridge_rls_baseline$
    declare table_record record;
    begin
      for table_record in
        select c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relkind = 'r'
          and substring(c.relname from 1 for 7) = 'bridge_'
      loop
        execute format(
          'alter table public.%I enable row level security',
          table_record.relname
        );
      end loop;
    end
    $bridge_rls_baseline$;

    grant select on table
      public.bridge_profiles,
      public.bridge_titles,
      public.bridge_loop_identity_links,
      public.bridge_buyer_title_access
    to authenticated;

    do $bridge_core_policies$
    begin
      if not exists (
        select 1 from pg_policy
        where polrelid = 'public.bridge_profiles'::regclass
          and polname = 'bridge_profiles_self_select'
      ) then
        create policy bridge_profiles_self_select
          on public.bridge_profiles
          for select to authenticated
          using (exists (
            select 1 from public.bridge_loop_identity_links l
            where l.auth_user_id = (select auth.uid())
              and l.bridge_user_id = bridge_profiles.user_id
          ));
      end if;

      if not exists (
        select 1 from pg_policy
        where polrelid = 'public.bridge_titles'::regclass
          and polname = 'bridge_titles_owner_or_buyer_select'
      ) then
        create policy bridge_titles_owner_or_buyer_select
          on public.bridge_titles
          for select to authenticated
          using (exists (
            select 1
            from public.bridge_loop_identity_links l
            where l.auth_user_id = (select auth.uid())
              and (
                l.bridge_user_id = bridge_titles.owner_user_id
                or exists (
                  select 1
                  from public.bridge_buyer_title_access a
                  where a.title_id = bridge_titles.id
                    and a.buyer_user_id = l.bridge_user_id
                    and a.revoked_at is null
                    and (a.expires_at is null or a.expires_at > now())
                )
              )
          ));
      end if;

      if not exists (
        select 1 from pg_policy
        where polrelid = 'public.bridge_loop_identity_links'::regclass
          and polname = 'bridge_identity_links_self_select'
      ) then
        create policy bridge_identity_links_self_select
          on public.bridge_loop_identity_links
          for select to authenticated
          using (auth_user_id = (select auth.uid()));
      end if;

      if not exists (
        select 1 from pg_policy
        where polrelid = 'public.bridge_buyer_title_access'::regclass
          and polname = 'bridge_buyer_title_access_self_select'
      ) then
        create policy bridge_buyer_title_access_self_select
          on public.bridge_buyer_title_access
          for select to authenticated
          using (exists (
            select 1
            from public.bridge_loop_identity_links l
            where l.auth_user_id = (select auth.uid())
              and l.bridge_user_id = bridge_buyer_title_access.buyer_user_id
          ));
      end if;
    end
    $bridge_core_policies$;
  `);

  const bridgeRls = await client.query(`
    select
      count(*)::int as total_bridge_tables,
      count(*) filter (where not c.relrowsecurity)::int as rls_disabled_tables
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and substring(c.relname from 1 for 7) = 'bridge_'
  `);
  const corePolicies = await client.query(`
    select
      c.relname,
      c.relrowsecurity as rls_enabled,
      p.polname,
      p.polcmd,
      p.polroles = ARRAY[(select oid from pg_roles where rolname = 'authenticated')] as exact_authenticated_role,
      position('auth.uid()' in coalesce(pg_get_expr(p.polqual, p.polrelid), '')) > 0 as binds_to_auth_user,
      case c.relname
        when 'bridge_profiles' then
          position('bridge_loop_identity_links' in coalesce(pg_get_expr(p.polqual, p.polrelid), '')) > 0
          and position('bridge_profiles.user_id' in coalesce(pg_get_expr(p.polqual, p.polrelid), '')) > 0
        when 'bridge_titles' then
          position('bridge_loop_identity_links' in coalesce(pg_get_expr(p.polqual, p.polrelid), '')) > 0
          and position('bridge_buyer_title_access' in coalesce(pg_get_expr(p.polqual, p.polrelid), '')) > 0
          and position('bridge_titles.owner_user_id' in coalesce(pg_get_expr(p.polqual, p.polrelid), '')) > 0
        when 'bridge_loop_identity_links' then
          position('auth_user_id' in coalesce(pg_get_expr(p.polqual, p.polrelid), '')) > 0
        when 'bridge_buyer_title_access' then
          position('bridge_buyer_title_access.buyer_user_id' in coalesce(pg_get_expr(p.polqual, p.polrelid), '')) > 0
        else false
      end as owner_scope_valid,
      has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
      has_table_privilege('anon', c.oid, 'SELECT') as anon_select
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_policy p
      on p.polrelid = c.oid
     and p.polname = case c.relname
       when 'bridge_profiles' then 'bridge_profiles_self_select'
       when 'bridge_titles' then 'bridge_titles_owner_or_buyer_select'
       when 'bridge_loop_identity_links' then 'bridge_identity_links_self_select'
       when 'bridge_buyer_title_access' then 'bridge_buyer_title_access_self_select'
     end
    where n.nspname = 'public'
      and c.relname in (
        'bridge_profiles','bridge_titles',
        'bridge_loop_identity_links','bridge_buyer_title_access'
      )
    order by c.relname
  `);
  if (
    bridgeRls.rows[0]?.total_bridge_tables < 1 ||
    bridgeRls.rows[0]?.rls_disabled_tables !== 0 ||
    corePolicies.rows.length !== 4 ||
    corePolicies.rows.some((row) =>
      !row.rls_enabled ||
      !row.polname ||
      row.polcmd !== 'r' ||
      !row.exact_authenticated_role ||
      !row.binds_to_auth_user ||
      !row.owner_scope_valid ||
      !row.authenticated_select ||
      row.anon_select
    )
  ) {
    throw new Error(
      "Core Bridge RLS/identity policy verification failed: " +
      JSON.stringify({ bridgeRls: bridgeRls.rows, corePolicies: corePolicies.rows }),
    );
  }
  console.log(
    `[migration-replay] verified RLS on all ${bridgeRls.rows[0].total_bridge_tables} Bridge tables and exact self/owner policies on four client-readable core tables`,
  );

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
    "public.bridge_delivery_jobs",
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
      case
        when c.relname in (
          'bridge_creator_notifications',
          'loop_media_migration_queue',
          'loop_parental_controls'
        ) then exists (
          select 1 from pg_policy p
          where p.polrelid = c.oid and p.polname = 'deny_client_access'
        )
        when c.relname = 'bridge_story_concept_submissions' then (
          exists (
            select 1 from pg_policy p
            where p.polrelid = c.oid and p.polname = 'Deny anonymous public access'
          )
          and exists (
            select 1 from pg_policy p
            where p.polrelid = c.oid
              and p.polname = 'bridge_story_concept_submissions_owner_only'
          )
        )
        when c.relname = 'bridge_buyer_interest' then not exists (
          select 1 from pg_policy p where p.polrelid = c.oid
        )
        when c.relname = 'bridge_delivery_jobs' then exists (
          select 1 from pg_policy p
          where p.polrelid = c.oid
            and p.polname = 'bridge_delivery_jobs_internal_only'
            and p.polcmd = '*'
            and p.polroles = ARRAY[(select oid from pg_roles where rolname = 'authenticated')]
            and position(
              'private.bridge_is_internal' in coalesce(pg_get_expr(p.polqual, p.polrelid), '')
            ) > 0
            and position(
              'private.bridge_is_internal' in coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
            ) > 0
        )
        else false
      end as policy_state_valid
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any($1::text[])
    order by c.relname
  `, [[
    "bridge_creator_notifications",
    "bridge_story_concept_submissions",
    "bridge_buyer_interest",
    "loop_media_migration_queue",
    "loop_parental_controls",
    "bridge_delivery_jobs",
  ]]);
  if (
    baselineRls.rows.length !== 6 ||
    baselineRls.rows.some((row) => !row.rls_enabled || !row.policy_state_valid)
  ) {
    throw new Error(
      "Pre-ledger baseline RLS/policy verification failed: " +
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
