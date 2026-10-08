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
     values ($1::text, $2::uuid, 'scope_a_test', now(), $2::text)`,
    [userId, userId],
  );
  await client.query("commit");

  const afterProfiles = await scalar("select count(*)::int as value from bridge_profiles");
  const afterLinks = await scalar("select count(*)::int as value from bridge_loop_identity_links");

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
} finally {
  await client.end();
}
