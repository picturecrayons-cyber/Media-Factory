import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

const binding = process.env.BRIDGE_MIGRATION_TEST_DATABASE_URL;
const expected = "postgres://migration_test:migration_test@127.0.0.1:5432/bridge_migration_test";
if (process.env.CI !== "true" || binding !== expected) {
  throw new Error("Refusing to run migration test outside its dedicated disposable GitHub Actions Postgres service");
}
const pool = new pg.Pool({ connectionString: binding, max: 1, connectionTimeoutMillis: 5000 });
const migration = await readFile(new URL("../migrations/0023_bridge_title_archive_revisions.sql", import.meta.url), "utf8");
try {
  await pool.query(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $$;
    create table public.bridge_titles (id text primary key, updated_at timestamptz);
    create table public.bridge_profiles (user_id text primary key);
    insert into public.bridge_titles(id, updated_at) values ('migration-fixture-title', now());
    insert into public.bridge_profiles(user_id) values ('creator-1'), ('reviewer-1');
  `);
  await pool.query(migration);

  const columns = await pool.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='bridge_titles'
      and column_name in ('archived_at','archived_by','archive_reason')
    order by column_name
  `);
  assert.deepEqual(columns.rows.map((row) => row.column_name), ["archive_reason","archived_at","archived_by"]);

  const revisionTable = await pool.query(`
    select c.relrowsecurity as rls_enabled
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='bridge_title_revisions'
  `);
  assert.equal(revisionTable.rows.length, 1);
  assert.equal(revisionTable.rows[0].rls_enabled, true);

  const indexes = await pool.query(`
    select indexname from pg_indexes
    where schemaname='public' and tablename='bridge_title_revisions'
  `);
  assert.ok(indexes.rows.some((row) => row.indexname === "bridge_title_revisions_one_pending_per_title_idx"));
  assert.ok(indexes.rows.some((row) => row.indexname === "bridge_title_revisions_title_created_idx"));

  const grants = await pool.query(`
    select has_table_privilege('anon','public.bridge_title_revisions','SELECT') as anon_select,
           has_table_privilege('authenticated','public.bridge_title_revisions','SELECT') as authenticated_select
  `);
  assert.equal(grants.rows[0].anon_select, false);
  assert.equal(grants.rows[0].authenticated_select, false);

  await pool.query(`
    insert into public.bridge_title_revisions(title_id,revision_number,submitted_by,proposed_changes)
    values ('migration-fixture-title',1,'creator-1','{"title":"Updated title"}'::jsonb)
  `);
  await assert.rejects(
    pool.query(`
      insert into public.bridge_title_revisions(title_id,revision_number,submitted_by,proposed_changes)
      values ('migration-fixture-title',2,'creator-1','{"synopsis":"Second pending"}'::jsonb)
    `),
    (error) => error.code === "23505",
    "only one PENDING revision per title must be enforced",
  );
  await assert.rejects(
    pool.query(`
      insert into public.bridge_title_revisions(title_id,revision_number,submitted_by,status,proposed_changes,reviewed_by,reviewed_at)
      values ('migration-fixture-title',3,'creator-1','APPROVED','{"title":"Bad"}'::jsonb,null,null)
    `),
    (error) => error.code === "23514",
    "reviewed revisions must have reviewer and review timestamp",
  );
  await assert.rejects(
    pool.query(`
      insert into public.bridge_title_revisions(title_id,revision_number,submitted_by,status,proposed_changes,reviewed_by,reviewed_at)
      values ('migration-fixture-title',4,'creator-1','APPROVED','[]'::jsonb,'reviewer-1',now())
    `),
    (error) => error.code === "23514",
    "proposed_changes must be a JSON object",
  );
  await assert.rejects(
    pool.query("delete from public.bridge_titles where id='migration-fixture-title'"),
    (error) => error.code === "23503",
    "revision history must prevent deleting its referenced title",
  );

  await pool.query(migration);
  const pendingCount = await pool.query("select count(*)::int as count from public.bridge_title_revisions where status='PENDING'");
  assert.equal(pendingCount.rows[0].count, 1);
  console.log("PASS: archive columns, revision constraints, partial uniqueness, RLS, browser privilege revocation, FK protection and idempotent re-application");
} finally {
  await pool.end();
}
