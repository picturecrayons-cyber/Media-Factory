import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
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


const serviceRequestMigration = readFileSync(
  new URL("../supabase/migrations/20261124212758_bridge_service_request_backend_routing.sql", import.meta.url),
  "utf8",
);

test("service-request routing migration safely skips when the table is absent", async () => {
  const db = new PGlite();
  try {
    await db.exec(serviceRequestMigration);
    const relation = await db.query(
      "select to_regclass('public.bridge_service_requests') as relation",
    );
    const triggerFunction = await db.query(
      "select to_regprocedure('public.bridge_route_service_request_team()') as function",
    );
    assert.equal(relation.rows[0].relation, null);
    assert.equal(triggerFunction.rows[0].function, null);
  } finally {
    await db.close();
  }
});

test("service-request routing migration applies when the table exists", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.bridge_service_requests (
        id bigserial primary key,
        status text not null,
        created_at timestamptz not null default now()
      );
    `);
    await db.exec(serviceRequestMigration);

    const columns = await db.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'bridge_service_requests'
        and column_name in ('assigned_team', 'decision_required')
      order by column_name
    `);
    assert.deepEqual(columns.rows.map((row) => row.column_name), [
      "assigned_team",
      "decision_required",
    ]);

    const trigger = await db.query(`
      select 1
      from pg_trigger
      where tgrelid = 'public.bridge_service_requests'::regclass
        and tgname = 'bridge_service_request_team_routing'
        and not tgisinternal
    `);
    assert.equal(trigger.rows.length, 1);

    await db.query(
      "insert into public.bridge_service_requests (status) values ($1)",
      ["UNDER_REVIEW"],
    );
    let routed = await db.query(
      "select assigned_team, decision_required from public.bridge_service_requests",
    );
    assert.deepEqual(routed.rows[0], {
      assigned_team: "decision_queue",
      decision_required: true,
    });

    await db.query(
      "update public.bridge_service_requests set status = $1",
      ["IN_PROGRESS"],
    );
    routed = await db.query(
      "select assigned_team, decision_required from public.bridge_service_requests",
    );
    assert.deepEqual(routed.rows[0], {
      assigned_team: "backend",
      decision_required: false,
    });
  } finally {
    await db.close();
  }
});
