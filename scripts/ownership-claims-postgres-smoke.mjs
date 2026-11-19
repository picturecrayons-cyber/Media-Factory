import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.BRIDGE_OWNERSHIP_TEST_DATABASE_URL?.trim();
if (!connectionString) throw new Error("BRIDGE_OWNERSHIP_TEST_DATABASE_URL is required.");

const url = new URL(connectionString);
if (
  !["postgres:", "postgresql:"].includes(url.protocol) ||
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  url.port !== "5432" ||
  url.pathname !== "/bridge_ownership_test"
) {
  throw new Error("Ownership claim schema test is restricted to disposable local PostgreSQL at 127.0.0.1:5432/bridge_ownership_test.");
}

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10_000 });
const migration = await readFile(
  new URL("../supabase/draft-migrations/20261119090000_bridge_title_ownership_claims.sql", import.meta.url),
  "utf8",
);

try {
  await pool.query(`
    do $roles$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
    end
    $roles$;
    create table if not exists public.bridge_titles (
      id text primary key
    );
  `);

  await pool.query(migration);

  const tables = [
    "bridge_title_ownership_claims",
    "bridge_title_ownership_claim_evidence",
    "bridge_title_ownership_claim_events",
  ];

  const rls = await pool.query(
    `select c.relname, c.relrowsecurity
     from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relname = any($1::text[])`,
    [tables],
  );
  assert.equal(rls.rows.length, 3, "all ownership-claim tables should exist");
  for (const row of rls.rows) assert.equal(row.relrowsecurity, true, `${row.relname} must have RLS enabled`);

  const grants = await pool.query(`
    select
      has_table_privilege('anon','public.bridge_title_ownership_claims','SELECT') as anon_select,
      has_table_privilege('authenticated','public.bridge_title_ownership_claims','SELECT') as authenticated_select,
      has_table_privilege('service_role','public.bridge_title_ownership_claims','SELECT') as service_select,
      has_table_privilege('service_role','public.bridge_title_ownership_claim_evidence','INSERT') as service_evidence_insert,
      has_table_privilege('service_role','public.bridge_title_ownership_claim_events','INSERT') as service_events_insert
  `);
  assert.deepEqual(grants.rows[0], {
    anon_select: false,
    authenticated_select: false,
    service_select: true,
    service_evidence_insert: true,
    service_events_insert: true,
  }, "server-only grants must be exact");

  const titleId = "bridge-ownership-claims-test-title";
  const claimant = "bridge-ownership-claims-test-creator";
  await pool.query("insert into public.bridge_titles (id) values ($1)", [titleId]);
  const claim = await pool.query(`
    insert into public.bridge_title_ownership_claims (
      title_id, claimant_user_id, claimant_account_type,
      current_owner_user_id_snapshot, producer_entity_name,
      claimant_capacity, claim_basis, declaration_text, attested_at
    ) values ($1,$2,'independent_creator',$3,$4,'PRODUCER','SOLE_NEGATIVE_RIGHTS',$5,now())
    returning id
  `, [titleId, claimant, "historical-owner", "New Darsan Creations", "A complete test declaration longer than eighty characters for disposable database verification only."]);
  const claimId = claim.rows[0].id;

  const evidence = await pool.query(`
    insert into public.bridge_title_ownership_claim_evidence (
      claim_id, category, file_name, content_type, byte_size,
      object_key, object_etag, status, uploaded_by, verified_at
    ) values ($1,'SIGNED_OWNERSHIP_DECLARATION','test-declaration.pdf','application/pdf',1024,
      'bridge/ownership-claims-test/declaration.pdf','etag-fixture','VERIFIED',$2,now())
    returning id
  `, [claimId, claimant]);

  await pool.query(`
    insert into public.bridge_title_ownership_claim_events
      (claim_id, actor_user_id, action, metadata)
    values ($1,$2,'CLAIM_CREATED','{"recordedOwnerUnchanged":true}'::jsonb)
  `, [claimId, claimant]);

  const counts = await pool.query(`
    select
      (select count(*)::int from public.bridge_title_ownership_claims where id=$1) as claims,
      (select count(*)::int from public.bridge_title_ownership_claim_evidence where claim_id=$1) as evidence,
      (select count(*)::int from public.bridge_title_ownership_claim_events where claim_id=$1) as events
  `, [claimId]);
  assert.deepEqual(counts.rows[0], { claims: 1, evidence: 1, events: 1 });

  const invalidClient = await pool.connect();
  try {
    await invalidClient.query("begin");
    await invalidClient.query("savepoint invalid_evidence");
    let rejected = false;
    try {
      await invalidClient.query(`
        insert into public.bridge_title_ownership_claim_evidence (
          claim_id, category, file_name, content_type, byte_size,
          object_key, uploaded_by
        ) values ($1,'OTHER','bad.exe','application/x-msdownload',128,'bridge/ownership-claims-test/bad.exe',$2)
      `, [claimId, claimant]);
    } catch {
      rejected = true;
      await invalidClient.query("rollback to savepoint invalid_evidence");
    }
    assert.equal(rejected, true, "unsupported evidence MIME type must be rejected");
    await invalidClient.query("rollback");
  } finally {
    invalidClient.release();
  }

  console.log(JSON.stringify({
    status: "PASS",
    scope: "disposable-local-postgresql",
    tables: tables.length,
    checks: [
      "schema-created",
      "RLS-enabled-on-all-claim-tables",
      "anon-authenticated-denied",
      "service-role-granted",
      "claim-evidence-event-roundtrip",
      "unsupported-mime-rejected",
    ],
    claimId,
    evidenceId: evidence.rows[0].id,
  }, null, 2));
} finally {
  await pool.end();
}
