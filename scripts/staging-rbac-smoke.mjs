#!/usr/bin/env node
import assert from "node:assert/strict";
import { Client } from "pg";
import { persistVerifiedAsset } from "../src/lib/bridge/asset-confirmation.ts";
import { seedStagingRbacFixtures } from "./staging-rbac-fixtures.mjs";

const REQUIRED_PROJECT_REF = "jbymleftneggcgutlcqu";

function requireStagingOnlyEnvironment() {
  if (process.env.BRIDGE_STAGING_ALLOW_TRANSACTIONAL_FIXTURES !== "true") {
    throw new Error("Refusing to run transactional fixture test: first independently verify the Testing project identity/environment, then explicitly set BRIDGE_STAGING_ALLOW_TRANSACTIONAL_FIXTURES=true.");
  }
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
        (select relrowsecurity from pg_class where oid = 'public.bridge_organizations'::regclass) as organizations_rls,
        (select relrowsecurity from pg_class where oid = 'public.bridge_organization_memberships'::regclass) as memberships_rls,
        has_table_privilege('anon', 'public.bridge_organizations', 'SELECT') as anon_org_select,
        has_table_privilege('authenticated', 'public.bridge_organizations', 'SELECT') as authenticated_org_select,
        has_table_privilege('anon', 'public.bridge_organization_memberships', 'SELECT') as anon_membership_select,
        has_table_privilege('authenticated', 'public.bridge_organization_memberships', 'SELECT') as authenticated_membership_select
    `);
    const acl = schema.rows[0];
    assert.equal(acl.organizations_rls, true, "bridge_organizations RLS must be enabled");
    assert.equal(acl.memberships_rls, true, "bridge_organization_memberships RLS must be enabled");
    assert.equal(acl.anon_org_select, false, "anon must not SELECT organizations");
    assert.equal(acl.authenticated_org_select, false, "authenticated browser role must not SELECT organizations");
    assert.equal(acl.anon_membership_select, false, "anon must not SELECT memberships");
    assert.equal(acl.authenticated_membership_select, false, "authenticated browser role must not SELECT memberships");

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
