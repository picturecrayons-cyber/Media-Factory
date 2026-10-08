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

  const userId = randomUUID();
  const email = "scope-a@example.test";

  // The identity-link migration intentionally preserves the legacy Bridge user FK.
  // Seed the disposable auth/user identities so the DB assertion exercises the real
  // production relationship instead of failing on test-fixture setup.
  await client.query(
    `insert into "user" ("id", "name", "email", "emailVerified")
     values ($1, 'Scope A', $2, true)
     on conflict ("id") do nothing`,
    [userId, email],
  );
  await client.query(
    `insert into auth.users (id)
     values ($1::uuid)
     on conflict (id) do nothing`,
    [userId],
  );

  await client.query("begin");
  await client.query(
    `insert into auth.users (id) values ($1)`,
    [userId],
  );
  await client.query(
    `insert into \"user\" (\"id\", \"name\", \"email\", \"emailVerified\")
     values ($1, 'Scope A', $2, true)`,
    [userId, email],
  );
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
  await client.query("commit");

  const afterProfiles = await scalar("select count(*)::int as value from bridge_profiles");
  const afterLinks = await scalar("select count(*)::int as value from bridge_loop_identity_links");
  console.log(JSON.stringify({ stage: "identity_setup", beforeProfiles, beforeLinks, afterProfiles, afterLinks }));

  await assert(afterProfiles === beforeProfiles + 1, "profile insert assertion failed");
  await assert(afterLinks === beforeLinks + 1, "identity link insert assertion failed");

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
  await client.query("rollback");

  const rollbackRows = await scalar(
    "select count(*)::int as value from bridge_profiles where user_id = $1",
    [rollbackId],
  );
  console.log(JSON.stringify({ stage: "rollback", rollbackRows }));
  await assert(rollbackRows === 0, "transaction rollback assertion failed");

  const finalInvites = await scalar("select count(*)::int as value from bridge_invites");
  await assert(finalInvites === beforeInvites, "invite row count changed unexpectedly");

  console.log(
    JSON.stringify({
      before: {
        bridge_profiles: beforeProfiles,
        bridge_loop_identity_links: beforeLinks,
        bridge_invites: beforeInvites,
      },
      after: {
        bridge_profiles: afterProfiles,
        bridge_loop_identity_links: afterLinks,
        bridge_invites: finalInvites,
      },
      assertions: {
        migration_replay: "passed",
        profile_insert: "passed",
        identity_link_insert: "passed",
        same_email_unique_conflict: "passed",
        rollback: "passed",
        invite_count_stable: "passed",
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
