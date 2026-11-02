#!/usr/bin/env node
import assert from "node:assert/strict";
import { Client } from "pg";
import { persistVerifiedAsset } from "../src/lib/bridge/asset-confirmation.ts";
import { seedStagingRbacFixtures } from "./staging-rbac-fixtures.mjs";

const REQUIRED_PROJECT_REF = "jbymleftneggcgutlcqu";

function requireStagingOnlyEnvironment() {
  const projectRef = process.env.BRIDGE_STAGING_PROJECT_REF;
  const supabaseUrl = process.env.BRIDGE_STAGING_SUPABASE_URL;
  const databaseUrlText = process.env.BRIDGE_STAGING_DATABASE_URL;

  if (projectRef !== REQUIRED_PROJECT_REF) {
    throw new Error(`Refusing to run: BRIDGE_STAGING_PROJECT_REF must equal ${REQUIRED_PROJECT_REF}.`);
  }
  if (!supabaseUrl || new URL(supabaseUrl).hostname !== `${REQUIRED_PROJECT_REF}.supabase.co`) {
    throw new Error("Refusing to run: BRIDGE_STAGING_SUPABASE_URL must point to the exact staging project.");
  }
  if (!databaseUrlText) {
    throw new Error("Set BRIDGE_STAGING_DATABASE_URL to the staging-only Postgres connection string.");
  }

  const databaseUrl = new URL(databaseUrlText);
  const directStagingHost = databaseUrl.hostname === `db.${REQUIRED_PROJECT_REF}.supabase.co`;
  const stagingPooler = databaseUrl.hostname.endsWith(".pooler.supabase.com") &&
    decodeURIComponent(databaseUrl.username).includes(REQUIRED_PROJECT_REF);
  if (!directStagingHost && !stagingPooler) {
    throw new Error("Refusing to run: database host/user does not prove the exact staging project. Production and unrecognized hosts are blocked.");
  }
  return databaseUrlText;
}

async function main() {
  const connectionString = requireStagingOnlyEnvironment();
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
    application_name: "bridge-staging-rbac-smoke-readwrite-transactional",
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '10s'");
    await client.query("SET LOCAL lock_timeout = '3s'");

    const schema = await client.query(`
      select
        to_regclass('public.bridge_organizations') is not null as organizations_present,
        to_regclass('public.bridge_organization_memberships') is not null as memberships_present
    `);
    const schemaReady = schema.rows[0];
    assert.equal(schemaReady.organizations_present, true, "approved STAGING schema must include bridge_organizations before Studio isolation fixtures");
    assert.equal(schemaReady.memberships_present, true, "approved STAGING schema must include bridge_organization_memberships before Studio isolation fixtures");

    const acl = await client.query(`
      select
        count(*) filter (where grantee in ('anon','authenticated'))::int as direct_grant_rows
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee in ('anon','authenticated')
        and privilege_type in ('SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER')
    `);
    assert.equal(Number(acl.rows[0].direct_grant_rows), 0,
      "anon and authenticated must not retain direct table privileges on the Bridge STAGING schema");

    const policyInventory = await client.query(`
      select count(*)::int as policy_count from pg_policies where schemaname = 'public'
    `);
    assert.ok(Number(policyInventory.rows[0].policy_count) > 0,
      "reviewed STAGING RLS policies must be installed before synthetic RBAC fixtures can run");

    const sequenceAcl = await client.query(`
      select count(*)::int as sequence_grant_rows
      from information_schema.usage_privileges
      where object_schema = 'public'
        and object_type = 'SEQUENCE'
        and grantee in ('anon','authenticated')
    `);
    assert.equal(Number(sequenceAcl.rows[0].sequence_grant_rows), 0,
      "anon and authenticated must not retain direct sequence privileges on Bridge STAGING");

    const fixtures = await seedStagingRbacFixtures(client);

    // Exercise the fail-closed base workspace profile query without touching
    // optional organization tables/columns. Organization scope is deliberately null.
    const workspaceProfile = await client.query(
      `select user_id, email, display_name, account_type, organization_name,
              null::text as organization_id, internal_role, email_verified
         from public.bridge_profiles where user_id = $1 limit 1`,
      [fixtures.memberAId],
    );
    assert.equal(workspaceProfile.rows.length, 1, "workspace profile query should load a staged profile without organization joins");
    assert.equal(workspaceProfile.rows[0].organization_id, null, "base workspace profile must not infer organization scope");
    assert.equal(workspaceProfile.rows[0].account_type, "studio", "staged workspace profile type should be preserved");

    const sql = {
      query: async (query, params) => (await client.query(query, params)).rows,
    };
    const common = {
      internalActor: false,
      kind: "master",
      byteSize: 1234,
      contentType: "video/mp4",
      checksum: "staging-rbac-synthetic-checksum",
    };

    const sameOrganizationAllowed = await persistVerifiedAsset(sql, {
      ...common,
      assetId: fixtures.assetAId,
      actorUserId: fixtures.memberAId,
      titleId: fixtures.titleAId,
      sourceKey: fixtures.sourceA,
      sealedKey: `${fixtures.sourceA}.verified-test`,
    });
    assert.equal(sameOrganizationAllowed, true, "verified active member of the title's Studio organization should confirm the synthetic upload");

    const otherOrganizationDenied = await persistVerifiedAsset(sql, {
      ...common,
      assetId: fixtures.assetBId,
      actorUserId: fixtures.memberBId,
      titleId: fixtures.titleBId,
      sourceKey: fixtures.sourceB,
      sealedKey: `${fixtures.sourceB}.verified-test`,
    });
    assert.equal(otherOrganizationDenied, false, "member of another Studio organization must not confirm the synthetic upload");

    const assetState = await client.query(
      "select id, byte_size from public.bridge_assets where id = any($1::text[]) order by id",
      [[fixtures.assetAId, fixtures.assetBId]],
    );
    const states = new Map(assetState.rows.map((row) => [row.id, row.byte_size == null ? null : Number(row.byte_size)]));
    assert.equal(states.get(fixtures.assetAId), 1234, "same-organization synthetic asset should be verified inside the transaction");
    assert.equal(states.get(fixtures.assetBId), null, "cross-organization synthetic asset must remain unverified");

    await client.query("ROLLBACK");
    transactionOpen = false;
    console.log("PASS: profile-only workspace query loads without organization joins and leaves organization scope null.");
    console.log("PASS: staging schema/RLS grants verified; same-organization upload confirmation allowed; cross-organization confirmation denied.");
    console.log("PASS: all synthetic fixture rows were rolled back; no lasting staging records or storage objects were created.");
  } finally {
    if (transactionOpen) {
      try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
