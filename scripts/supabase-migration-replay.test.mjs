import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const replayScript = fileURLToPath(
  new URL("./supabase-migration-replay.mjs", import.meta.url),
);
const replaySource = readFileSync(replayScript, "utf8");
const creatorLifecycleMigration = readFileSync(
  new URL("../supabase/migrations/20261121160000_bridge_creator_draft_submission_lifecycle.sql", import.meta.url),
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

test("Creator Vault migration replay verifies UUID organization FK and server-only grants", () => {
  assert.ok(replaySource.includes("20261121140000_bridge_creator_document_org_uuid_fk.sql"));
  assert.match(replaySource, /organization_id_is_uuid/);
  assert.match(replaySource, /organization_fk_validated/);
  assert.match(replaySource, /owner_scope_check_validated/);
  assert.match(replaySource, /vault\.client_grants !== 0/);
  assert.match(replaySource, /vault\.service_role_grants < 6/);
});

test("Creator draft lifecycle migration is replayed and verified", () => {
  assert.ok(replaySource.includes("20261121160000_bridge_creator_draft_submission_lifecycle.sql"));
  assert.match(replaySource, /submission_status_check_validated/);
  assert.match(replaySource, /deleted_by_fk_validated/);
  assert.match(replaySource, /active_owner_index/);
});

test("Creator draft archive is enforced by authenticated title RLS after migration replay", () => {
  assert.match(replaySource, /archived_title_rls_filter/);
  assert.match(creatorLifecycleMigration, /deleted_at is null/);
});

test("Creator title RLS requires active Studio organization membership", () => {
  assert.match(creatorLifecycleMigration, /bridge_organization_memberships m/);
  assert.match(creatorLifecycleMigration, /m\.status = 'active'/);
  assert.match(replaySource, /studio_membership_rls_filter/);
});

test("Production asset RLS is owner-only and removes the public definer helper", () => {
  assert.match(creatorLifecycleMigration, /bridge_production_assets_owner_select/);
  assert.match(creatorLifecycleMigration, /create or replace function private\.bridge_is_title_owner/);
  assert.match(creatorLifecycleMigration, /create or replace function private\.bridge_has_buyer_title_access/);
  assert.match(creatorLifecycleMigration, /create or replace function private\.bridge_can_read_title/);
  assert.match(creatorLifecycleMigration, /grant usage on schema private to authenticated, service_role/);
  assert.match(creatorLifecycleMigration, /set search_path = ''/);
  assert.match(creatorLifecycleMigration, /bridge_organization_memberships m/);
  assert.match(creatorLifecycleMigration, /m\.status = 'active'/);
  assert.match(creatorLifecycleMigration, /drop function if exists public\.bridge_is_title_owner\(text\)/);
  assert.match(replaySource, /production_asset_rls_scoped/);
  assert.match(replaySource, /definer_helper_removed/);
});
