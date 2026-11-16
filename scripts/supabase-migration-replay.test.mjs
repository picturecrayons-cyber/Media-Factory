import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const replayScript = fileURLToPath(
  new URL("./supabase-migration-replay.mjs", import.meta.url),
);
const replaySource = readFileSync(replayScript, "utf8");

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

test("feature archive migration is checked after the 69-row recovered baseline", () => {
  assert.match(replaySource, /const EXPECTED_MIGRATIONS = 69/);
  assert.match(replaySource, /const FEATURE_MIGRATION = "20261116150000_bridge_title_archive_restore\\.sql"/);
  assert.match(replaySource, /FEATURE_MIGRATION_BYTES = 1117/);
  assert.match(replaySource, /FEATURE_MIGRATION_SHA256 = "3669b65c17642c2867c6efb7f8505943e8397756890fb6748bb6eb6ced9449bc"/);
  assert.match(replaySource, /Draft archive feature migration schema verification failed/);
  assert.match(replaySource, /await client\.query\(await readFile\(featureMigrationPath, "utf8"\)\)/);
});
