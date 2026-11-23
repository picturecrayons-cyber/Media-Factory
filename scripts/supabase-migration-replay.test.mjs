import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const replayScript = fileURLToPath(
  new URL("./supabase-migration-replay.mjs", import.meta.url),
);
const replaySource = readFileSync(replayScript, "utf8");
const archiveMigration = readFileSync(
  new URL("../supabase/migrations/20261122180000_bridge_archive_fail_closed_contract.sql", import.meta.url),
  "utf8",
);
const productionRolloutMigration = readFileSync(
  new URL("../supabase/migrations/20261123015009_bridge_owner_submission_production_rollout.sql", import.meta.url),
  "utf8",
);

test("local replay restores Production Bridge RLS on every public Bridge table", () => {
  assert.match(replaySource, /substring\(c\.relname from 1 for 7\) = 'bridge_'/);
  assert.match(replaySource, /alter table public\.%I enable row level security/);
  assert.match(replaySource, /rls_disabled_tables/);
  assert.match(replaySource, /rls_disabled_tables !== 0/);
});

test("core Bridge client policies are authenticated-only and identity/owner scoped", () => {
  for (const policy of [
    "bridge_profiles_self_select",
    "bridge_titles_owner_or_buyer_select",
    "bridge_identity_links_self_select",
    "bridge_buyer_title_access_self_select",
  ]) {
    assert.ok(replaySource.includes(policy), `missing core policy: ${policy}`);
  }
  assert.match(replaySource, /p\.polroles = ARRAY\[\(select oid from pg_roles where rolname = 'authenticated'\)\]/);
  assert.match(replaySource, /position\('auth\.uid\(\)' in coalesce\(pg_get_expr\(p\.polqual, p\.polrelid\), ''\)\) > 0/);
  assert.match(replaySource, /owner_scope_valid/);
  assert.match(replaySource, /authenticated_select/);
  assert.match(replaySource, /anon_select/);
});

const rejectedTargets = [
  ["hosted Supabase", "postgresql://postgres:secret@db.example.supabase.co:5432/postgres"],
  ["remote database IP", "postgresql://postgres:secret@203.0.113.10:5432/postgres"],
  ["local default port", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"],
  ["wrong local port", "postgresql://postgres:postgres@localhost:5432/postgres"],
  ["non-Postgres protocol", "https://localhost:55432/postgres"],
  ["local URL with query parameters", "postgresql://postgres:postgres@127.0.0.1:55432/postgres?sslmode=require"],
];

for (const [label, databaseUrl] of rejectedTargets) {
  test(`migration replay rejects ${label} before any database connection`, () => {
    const result = spawnSync(process.execPath, [replayScript], {
      encoding: "utf8",
      env: {
        ...process.env,
        SUPABASE_REPLAY_DATABASE_URL: databaseUrl,
      },
      timeout: 10_000,
    });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    assert.match(
      result.stderr,
      /local Supabase Postgres at localhost:55432\/postgres; remote databases are forbidden/,
    );
    assert.doesNotMatch(result.stderr, /ECONNREFUSED|ENOTFOUND|ETIMEDOUT/);
  });
}


test("Testing candidate migrations are explicitly excluded from the immutable Production ledger replay", () => {
  assert.match(replaySource, /const EXPECTED_PRODUCTION_MIGRATIONS = 71;/);
  for (const name of ["20261122100000_bridge_title_owner_submissions.sql","20261122125255_owner_submission_lifecycle_20261122.sql","20261122141000_reversible_archive_owner_submission_repair_20261122.sql","20261122150000_bridge_delivery_jobs_testing_reconciliation.sql","20261122153000_bridge_delivery_jobs_no_cascade_hardening_20261122.sql","20261122180000_bridge_archive_fail_closed_contract.sql","20261123210000_bridge_owner_submission_status_constraints_repair.sql"]) {
    assert.ok(replaySource.includes(name), `missing explicit non-Production classification: ${name}`);
    assert.ok(replaySource.includes(`Declared Testing candidate migration is missing: ${name}` ) === false);
  }
  assert.ok(!replaySource.includes("20261123015009_bridge_owner_submission_production_rollout.sql"), "post-snapshot rollout must not be classified Testing-only");
  assert.match(replaySource, /const names = allNames\.filter/);
  assert.match(replaySource, /manifestRows.size !== EXPECTED_PRODUCTION_MIGRATIONS/);
});


test("Production owner-submission rollout is additive and does not rewrite title rows", () => {
  assert.match(productionRolloutMigration, /add column if not exists owner_submission_status/);
  assert.match(productionRolloutMigration, /create table if not exists public\.bridge_owner_submission_events/);
  assert.match(productionRolloutMigration, /create table if not exists public\.bridge_title_archive_events/);
  assert.doesNotMatch(productionRolloutMigration, /\b(update|delete)\s+public\.bridge_titles\b/i);
});

test("archive dependency scan validates required columns before dynamic SQL", () => {
  assert.match(archiveMigration, /information_schema\.columns/);
  assert.match(archiveMigration, /bridge_delivery_jobs','title_id/);
  assert.match(archiveMigration, /bridge_loop_publications','bridge_title_id/);
  assert.match(archiveMigration, /bridge_title_events','from_status/);
  assert.match(archiveMigration, /:missing/);
  assert.match(archiveMigration, /if cardinality\(blockers\) > 0 then\s+return blockers;/);
});


test("archive migration replaces the weaker lifecycle constraint with DRAFT-only state", () => {
  assert.match(archiveMigration, /drop constraint if exists bridge_titles_archive_state_check/);
  assert.match(archiveMigration, /previous_status = 'DRAFT'/);
  assert.match(archiveMigration, /\) not valid;/);
});
