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

test("pre-ledger RLS checks validate exact roles, commands and full predicates", () => {
  assert.match(replaySource, /p\.polcmd = '\*'/);
  assert.match(replaySource, /p\.polpermissive/);
  assert.match(replaySource, /cardinality\(p\.polroles\) = 2/);
  assert.match(replaySource, /rolname = 'anon'\) = any\(p\.polroles\)/);
  assert.match(replaySource, /rolname = 'authenticated'\) = any\(p\.polroles\)/);
  assert.match(replaySource, /p\.polwithcheck is null/);
  assert.match(replaySource, /polname = 'Deny anonymous public access'/);
  assert.match(replaySource, /polname = 'bridge_story_concept_submissions_owner_only'/);
  assert.ok(replaySource.includes("regexp_replace(pg_get_expr(p.polqual, p.polrelid), '[[:space:]]+', '', 'g')"));
  assert.ok(replaySource.includes("regexp_replace(pg_get_expr(p.polwithcheck, p.polrelid), '[[:space:]]+', '', 'g')"));
  // The entire normalized predicates are compared, so appending OR true cannot pass.
  assert.ok(replaySource.includes("(EXISTS(SELECT1FROM(bridge_titlestJOINbridge_loop_identity_linkslON((l.bridge_user_id=t.owner_user_id)))WHERE((t.id=bridge_story_concept_submissions.title_id)AND(l.auth_user_id=(SELECTauth.uid()ASuid)))))"));
  assert.ok(replaySource.includes("(SELECTprivate.bridge_is_internal()ASbridge_is_internal)"));
  assert.ok(replaySource.includes("bridge_story_concept_submissions.title_id"));
  assert.ok(replaySource.includes("private.bridge_is_internal()"));
  assert.ok(replaySource.includes("not has_table_privilege('anon', c.oid, 'INSERT')"));
  for (const role of ["anon", "authenticated"]) {
    for (const privilege of ["TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"]) {
      assert.ok(
        replaySource.includes("not has_table_privilege('" + role + "', c.oid, '" + privilege + "')"),
        "missing " + role + " " + privilege + " deny assertion",
      );
    }
  }
  assert.match(replaySource, /polname = 'bridge_delivery_jobs_internal_only'/);
});

