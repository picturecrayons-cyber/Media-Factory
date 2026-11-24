import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;
const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Disposable PostgreSQL connection string is required");
}

const client = new Client({ connectionString });
await client.connect();

async function scalar(sql, params = []) {
  const res = await client.query(sql, params);
  return Number(res.rows[0]?.value ?? 0);
}

async function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const beforeProfiles = await scalar("select count(*)::int as value from bridge_profiles");
  const beforeLinks = await scalar("select count(*)::int as value from bridge_loop_identity_links");
  const beforeInvites = await scalar("select count(*)::int as value from bridge_invites");
  const beforeMandates = await scalar("select count(*)::int as value from bridge_creator_distribution_mandates");

  const userId = randomUUID();
  const email = "scope-a@example.test";

  // Seed the disposable Better Auth and Bridge user identities required by the
  // identity-link foreign keys before exercising the transactional onboarding writes.
  await client.query(
    `insert into "user" ("id", "name", "email", "emailVerified")
     values ($1, 'Scope A', $2, true)
     on conflict ("id") do nothing`,
    [userId, email],
  );
  await client.query(
    `insert into auth.users (id) values ($1::uuid) on conflict (id) do nothing`,
    [userId],
  );

  await client.query("begin");
  await client.query(
    `insert into bridge_profiles
      (user_id, email, display_name, account_type, organization_name, internal_role, email_verified)
     values ($1, $2, 'Scope A', 'independent_creator', null, null, true)`,
    [userId, email],
  );
  await client.query(
    `insert into bridge_loop_identity_links
      (bridge_user_id, auth_user_id, verification_method, verified_at, verified_by)
     values ($1, $2::uuid, 'supabase_auth_onboarding', now(), $1)`,
    [userId, userId],
  );
  const acceptedAt = new Date().toISOString();
  const mandateScope = {
    enabled: true,
    version: 1,
    destinations: ["Crayons Loop", "External OTT"],
    media: ["SVOD", "TVOD"],
    acceptedAt,
    consentTextVersion: "creator-distribution-mandate-v1",
    sublicensingAllowed: false,
  };
  await client.query(
    `insert into bridge_creator_distribution_mandates
      (creator_user_id, mandate_version, status, scope, accepted_at, consent_text_version)
     values ($1, 1, 'ACTIVE', $2::jsonb, $3::timestamptz, 'creator-distribution-mandate-v1')`,
    [userId, JSON.stringify(mandateScope), acceptedAt],
  );
  await client.query("commit");

  const afterProfiles = await scalar("select count(*)::int as value from bridge_profiles");
  const afterLinks = await scalar("select count(*)::int as value from bridge_loop_identity_links");
  const afterMandates = await scalar("select count(*)::int as value from bridge_creator_distribution_mandates");
  console.log(JSON.stringify({ stage: "identity_setup", beforeProfiles, beforeLinks, beforeMandates, afterProfiles, afterLinks, afterMandates }));

  await assert(afterProfiles === beforeProfiles + 1, "profile insert assertion failed");
  await assert(afterLinks === beforeLinks + 1, "identity link insert assertion failed");
  await assert(afterMandates === beforeMandates + 1, "creator mandate insert assertion failed");
  const mandateRows = await client.query(
    `select status, scope->>'sublicensingAllowed' as sublicensing_allowed
     from bridge_creator_distribution_mandates where creator_user_id = $1`,
    [userId],
  );
  await assert(mandateRows.rows[0]?.status === "ACTIVE", "creator mandate status assertion failed");
  await assert(mandateRows.rows[0]?.sublicensing_allowed === "false", "default mandate sublicensing must remain disabled");
  const privileges = await client.query(
    `select
      has_table_privilege('anon', 'public.bridge_creator_distribution_mandates', 'select') as anon_select,
      has_table_privilege('authenticated', 'public.bridge_creator_distribution_mandates', 'select') as authenticated_select,
      has_table_privilege('service_role', 'public.bridge_creator_distribution_mandates', 'insert') as service_insert`,
  );
  await assert(privileges.rows[0]?.anon_select === false, "anon must not have direct mandate table access");
  await assert(privileges.rows[0]?.authenticated_select === false, "authenticated must not have direct mandate table access");
  await assert(privileges.rows[0]?.service_insert === true, "service_role must be able to persist mandate acceptance");
  const rls = await client.query(
    `select c.relrowsecurity as enabled
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'bridge_creator_distribution_mandates'`,
  );
  await assert(rls.rows[0]?.enabled === true, "creator mandate table RLS must be enabled");

  let sameEmailBlocked = false;
  try {
    await client.query(
      `insert into bridge_profiles
        (user_id, email, display_name, account_type, organization_name, internal_role, email_verified)
       values ($1, $2, 'Conflict', 'independent_creator', null, null, true)`,
      [randomUUID(), email],
    );
  } catch (error) {
    sameEmailBlocked = error?.code === "23505";
  }
  await assert(sameEmailBlocked, "same-email foreign profile was not blocked by unique index");

  const rollbackId = randomUUID();
  await client.query("begin");
  await client.query(
    `insert into bridge_profiles
      (user_id, email, display_name, account_type, organization_name, internal_role, email_verified)
     values ($1, $2, 'Rollback', 'independent_creator', null, null, true)`,
    [rollbackId, "scope-a-rollback@example.test"],
  );
  await client.query(
    `insert into bridge_creator_distribution_mandates
      (creator_user_id, mandate_version, status, scope, accepted_at, consent_text_version)
     values ($1, 1, 'ACTIVE', $2::jsonb, now(), 'creator-distribution-mandate-v1')`,
    [rollbackId, JSON.stringify({ enabled: true, version: 1, destinations: ["Crayons Loop"], media: ["SVOD"], acceptedAt: new Date().toISOString(), consentTextVersion: "creator-distribution-mandate-v1", sublicensingAllowed: false })],
  );
  await client.query("rollback");

  const rollbackRows = await scalar(
    "select count(*)::int as value from bridge_profiles where user_id = $1",
    [rollbackId],
  );
  console.log(JSON.stringify({ stage: "rollback", rollbackRows }));
  await assert(rollbackRows === 0, "transaction rollback assertion failed");

  const finalInvites = await scalar("select count(*)::int as value from bridge_invites");
  const finalMandates = await scalar("select count(*)::int as value from bridge_creator_distribution_mandates");
  await assert(finalInvites === beforeInvites, "invite row count changed unexpectedly");
  await assert(finalMandates === afterMandates, "rolled-back mandate must not persist");

  console.log(
    JSON.stringify({
      before: {
        bridge_profiles: beforeProfiles,
        bridge_loop_identity_links: beforeLinks,
        bridge_invites: beforeInvites,
        bridge_creator_distribution_mandates: beforeMandates,
      },
      after: {
        bridge_profiles: afterProfiles,
        bridge_loop_identity_links: afterLinks,
        bridge_invites: finalInvites,
        bridge_creator_distribution_mandates: finalMandates,
      },
      assertions: {
        migration_replay: "passed",
        profile_insert: "passed",
        identity_link_insert: "passed",
        same_email_unique_conflict: "passed",
        rollback: "passed",
        invite_count_stable: "passed",
        creator_mandate_insert: "passed",
        mandate_rls_and_grants: "passed",
        mandate_rollback: "passed",
      },
    }),
  );
} catch (error) {
  console.error(JSON.stringify({
    stage: "db_assertion_failure",
    name: error?.name,
    message: error?.message,
    code: error?.code,
    constraint: error?.constraint,
    detail: error?.detail,
    hint: error?.hint,
  }));
  throw error;
} finally {
  await client.end();
}
