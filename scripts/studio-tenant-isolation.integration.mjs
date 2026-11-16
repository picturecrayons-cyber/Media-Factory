import pg from "pg";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  listMyStoryConceptRows,
  listOwnedBridgeTitles,
  resolveActiveOrganizationForUser,
} from "../src/lib/bridge/studio-tenant-scope.ts";

const { Client } = pg;
const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;
if (!connectionString) throw new Error("Disposable PostgreSQL connection string is required");

const client = new Client({ connectionString });
await client.connect();
const queryClient = {
  async query(text, params = []) {
    const result = await client.query(text, params);
    return result.rows;
  },
};

const id = () => randomUUID();
const prefix = `tenant-scope-${id()}`;
const userA = `${prefix}-a`;
const userAMember = `${prefix}-a-member`;
const userB = `${prefix}-b`;
const userRevoked = `${prefix}-revoked`;
const orgA = id();
const orgB = id();
const titleA = `title-${id()}`;
const titleB = `title-${id()}`;
const titleAOwn = `title-${id()}`;
const conceptA = id();
const conceptB = id();
const conceptAOwn = id();

async function createStudioProfile(userId, suffix, organizationId) {
  await client.query(
    `insert into bridge_profiles
      (user_id,email,display_name,account_type,organization_name,internal_role,email_verified,organization_id)
     values ($1,$2,$3,'studio','Same Studio Display Name',null,true,$4)`,
    [userId, `${prefix}-${suffix}@example.test`, suffix, organizationId],
  );
}

try {
  await client.query("begin");
  // The display name is deliberately the same for both organizations: tenant
  // access must follow UUID membership, never organization_name text.
  await client.query(
    `insert into bridge_organizations (id,legal_name,normalized_name,status)
     values ($1,'Studio A Legal','same studio display name','active'),
            ($2,'Studio B Legal','same studio display name','active')`,
    [orgA, orgB],
  );

  await createStudioProfile(userA, "a-owner", orgA);
  await createStudioProfile(userAMember, "a-member", orgA);
  await createStudioProfile(userB, "b-owner", orgB);
  await createStudioProfile(userRevoked, "revoked", orgA);

  await client.query(
    `insert into bridge_organization_memberships
      (organization_id,user_id,membership_role,status,created_by)
     values
      ($1,$2,'owner','active',$2),
      ($1,$3,'member','active',$2),
      ($4,$5,'owner','active',$5),
      ($1,$6,'member','removed',$2)`,
    [orgA, userA, userAMember, orgB, userB, userRevoked],
  );

  await client.query(
    `insert into bridge_titles
      (id,slug,name,owner_user_id,owner_account_type,owner_organization_id)
     values
      ($1,$2,'Studio A Shared Title',$3,'studio',$4),
      ($5,$6,'Studio B Shared Title',$7,'studio',$8),
      ($9,$10,'Studio A Owner Personal Title',$11,'studio',null)`,
    [
      titleA, `${titleA}-slug`, userA, orgA,
      titleB, `${titleB}-slug`, userB, orgB,
      titleAOwn, `${titleAOwn}-slug`, userA,
    ],
  );

  // The Scope A migration set intentionally excludes the full Supabase
  // Story/Concept migration set. Create this minimal schema inside the
  // disposable test transaction only when it is absent.
  await client.query(`
    create table if not exists public.bridge_story_concept_submissions (
      id uuid primary key default gen_random_uuid(),
      title_id text not null unique references public.bridge_titles(id) on delete cascade,
      created_at timestamptz not null default now()
    )
  `);
  await client.query(
    `insert into bridge_story_concept_submissions (id,title_id)
     values ($1,$2),($3,$4),($5,$6)`,
    [conceptA,titleA,conceptB,titleB,conceptAOwn,titleAOwn],
  );

  const resolvedA = await resolveActiveOrganizationForUser(queryClient, userA);
  const resolvedAMember = await resolveActiveOrganizationForUser(queryClient, userAMember);
  const resolvedB = await resolveActiveOrganizationForUser(queryClient, userB);
  const resolvedRevoked = await resolveActiveOrganizationForUser(queryClient, userRevoked);
  assert.equal(resolvedA, orgA, "Studio A owner must resolve Org A");
  assert.equal(resolvedAMember, orgA, "active Studio A member must resolve Org A");
  assert.equal(resolvedB, orgB, "Studio B owner must resolve Org B");
  assert.equal(resolvedRevoked, null, "removed member must not resolve an organization");

  const titlesA = await listOwnedBridgeTitles(queryClient, { userId: userAMember, organizationId: resolvedAMember }, false);
  const titlesB = await listOwnedBridgeTitles(queryClient, { userId: userB, organizationId: resolvedB }, false);
  const forgedTitles = await listOwnedBridgeTitles(queryClient, { userId: userAMember, organizationId: orgB }, false);
  const revokedTitles = await listOwnedBridgeTitles(queryClient, { userId: userRevoked, organizationId: orgA }, false);
  assert.deepEqual(titlesA.map(row => row.id).sort(), [titleA].sort(), "Org A member sees only Org A title");
  assert.deepEqual(titlesB.map(row => row.id).sort(), [titleB].sort(), "Org B owner sees only Org B title");
  assert.deepEqual(forgedTitles.map(row => row.id), [], "Org A member cannot forge Org B organization ID");
  assert.deepEqual(revokedTitles.map(row => row.id), [], "removed member cannot see Org A title");

  const conceptsA = await listMyStoryConceptRows(queryClient, { userId: userAMember, organizationId: resolvedAMember });
  const conceptsB = await listMyStoryConceptRows(queryClient, { userId: userB, organizationId: resolvedB });
  const forgedConcepts = await listMyStoryConceptRows(queryClient, { userId: userAMember, organizationId: orgB });
  const revokedConcepts = await listMyStoryConceptRows(queryClient, { userId: userRevoked, organizationId: orgA });
  assert.deepEqual(conceptsA.map(row => row.id).sort(), [conceptA].sort(), "Org A member sees only Org A concept");
  assert.deepEqual(conceptsB.map(row => row.id).sort(), [conceptB].sort(), "Org B owner sees only Org B concept");
  assert.deepEqual(forgedConcepts.map(row => row.id), [], "Org A member cannot forge Org B concept scope");
  assert.deepEqual(revokedConcepts.map(row => row.id), [], "removed member cannot see Org A concepts");

  const titlesAOwner = await listOwnedBridgeTitles(queryClient, { userId: userA, organizationId: resolvedA }, false);
  assert.deepEqual(
    titlesAOwner.map(row => row.id).sort(),
    [titleA, titleAOwn].sort(),
    "Studio A owner sees organization and own titles",
  );

  console.log(JSON.stringify({
    result: "PASS",
    organizations: 2,
    active_members: 3,
    removed_members: 1,
    checks: [
      "organization resolved only through active membership",
      "same display name does not join organizations",
      "active members see only their organization's titles and concepts",
      "forged organization IDs cannot cross tenant boundary",
      "removed membership grants no organization access",
      "owner retains access to personal titles",
    ],
  }));
} finally {
  try { await client.query("rollback"); } finally { await client.end(); }
}
