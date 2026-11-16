import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const proposalPath = fileURLToPath(
  new URL("../supabase/staging-proposals/20261117_harden_loop_tvod_entitlement_search_path.sql", import.meta.url),
);
const proposalSql = await readFile(proposalPath, "utf8");

async function createReplayDatabase() {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $uid$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $uid$;
    create table public.loop_user_tvod_entitlements (
      user_id uuid not null,
      title_id text not null,
      access_type text not null,
      status text not null,
      expires_at timestamptz
    );
    grant usage on schema public, auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
    insert into public.loop_user_tvod_entitlements
      (user_id, title_id, access_type, status, expires_at)
    values
      ('11111111-1111-4111-8111-111111111111', 'title-active', 'RENTAL', 'ACTIVE', now() + interval '1 hour'),
      ('11111111-1111-4111-8111-111111111111', 'title-expired', 'RENTAL', 'ACTIVE', now() - interval '1 hour'),
      ('11111111-1111-4111-8111-111111111111', 'title-revoked', 'RENTAL', 'REVOKED', now() + interval '1 hour'),
      ('11111111-1111-4111-8111-111111111111', 'title-subscription', 'SUBSCRIPTION', 'ACTIVE', now() + interval '1 hour'),
      ('22222222-2222-4222-8222-222222222222', 'title-other-user', 'RENTAL', 'ACTIVE', now() + interval '1 hour');
  `);
  await db.exec(proposalSql);
  return db;
}

async function asAuthenticated(db, userId, titleId) {
  await db.exec("begin");
  try {
    await db.exec("set local role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await db.query(
      "select public.has_active_loop_tvod_entitlement($1) as allowed",
      [titleId],
    );
    await db.exec("rollback");
    return result.rows[0].allowed;
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

test("proposal pins SECURITY DEFINER function search_path to pg_catalog and keeps explicit role grants", async () => {
  const db = await createReplayDatabase();
  try {
    const result = await db.query(`
      select p.prosecdef as security_definer,
             p.proconfig as settings,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
             has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
             exists (
               select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where a.grantee = 0 and a.privilege_type = 'EXECUTE'
             ) as public_execute
      from pg_proc p
      where p.oid = 'public.has_active_loop_tvod_entitlement(text)'::regprocedure
    `);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].security_definer, true);
    assert.deepEqual(result.rows[0].settings, ["search_path=pg_catalog"]);
    assert.equal(result.rows[0].authenticated_execute, true);
    assert.equal(result.rows[0].service_execute, true);
    assert.equal(result.rows[0].anon_execute, false);
    assert.equal(result.rows[0].public_execute, false);
  } finally {
    await db.close();
  }
});

test("authenticated caller receives access only for their own active unexpired rental", async () => {
  const db = await createReplayDatabase();
  try {
    const userA = "11111111-1111-4111-8111-111111111111";
    const userB = "22222222-2222-4222-8222-222222222222";
    assert.equal(await asAuthenticated(db, userA, "title-active"), true);
    assert.equal(await asAuthenticated(db, userA, "title-expired"), false);
    assert.equal(await asAuthenticated(db, userA, "title-revoked"), false);
    assert.equal(await asAuthenticated(db, userA, "title-subscription"), false);
    assert.equal(await asAuthenticated(db, userA, "title-other-user"), false);
    assert.equal(await asAuthenticated(db, userB, "title-other-user"), true);
    assert.equal(await asAuthenticated(db, userB, "title-active"), false);
  } finally {
    await db.close();
  }
});
