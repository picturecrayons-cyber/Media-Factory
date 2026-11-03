import pg from "pg";
import { randomUUID } from "node:crypto";

const { Client } = pg;
const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;

if (process.env.SCOPE_A_DISPOSABLE_DATABASE !== "1") {
  throw new Error("Refusing DB test: SCOPE_A_DISPOSABLE_DATABASE=1 is required");
}
if (!connectionString) {
  throw new Error("Disposable PostgreSQL connection string is required");
}

const parsed = new URL(connectionString);
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const databaseName = decodeURIComponent(parsed.pathname.replace(/^\\//, ""));
if (!allowedHosts.has(parsed.hostname) || databaseName !== "bridge_scope_a") {
  throw new Error(
    `Refusing DB test outside disposable local bridge_scope_a (host=${parsed.hostname}, database=${databaseName})`,
  );
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

async function expectSqlState(sql, params, expectedCode, label) {
  const savepoint = `sp_${randomUUID().replaceAll("-", "")}`;
  await client.query(`savepoint ${savepoint}`);
  let actualCode = null;
  try {
    await client.query(sql, params);
  } catch (error) {
    actualCode = error?.code ?? null;
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
  await assert(
    actualCode === expectedCode,
    `${label}: expected SQLSTATE ${expectedCode}, received ${actualCode ?? "no error"}`,
  );
}

try {
  const beforeProfiles = await scalar("select count(*)::int as value from bridge_profiles");
  const beforeLinks = await scalar("select count(*)::int as value from bridge_loop_identity_links");
  const beforeInvites = await scalar("select count(*)::int as value from bridge_invites");

  const authUserId = randomUUID();
  const bridgeUserId = `scope-a-${randomUUID()}`;
  const email = `scope-a-${randomUUID()}@example.test`;

  // Supabase Auth is the only authentication principal in this identity contract.
  await client.query(
    "insert into auth.users (id) values ($1::uuid) on conflict (id) do nothing",
    [authUserId],
  );

  await client.query("begin");
  await client.query(
    `insert into bridge_profiles
      (user_id, email, display_name, account_type, organization_name, internal_role, email_verified)
     values ($1, $2, 'Scope A', 'independent_creator', null, null, true)`,
    [bridgeUserId, email],
  );
  await client.query(
    `insert into bridge_loop_identity_links
      (bridge_user_id, auth_user_id, verification_method, verified_at, verified_by)
     values ($1, $2::uuid, 'supabase_auth_onboarding', now(), $1)`,
    [bridgeUserId, authUserId],
  );
  await client.query("commit");

  const afterProfiles = await scalar("select count(*)::int as value from bridge_profiles");
  const afterLinks = await scalar("select count(*)::int as value from bridge_loop_identity_links");
  await assert(afterProfiles === beforeProfiles + 1, "valid Bridge profile FK insert failed");
  await assert(afterLinks === beforeLinks + 1, "valid Supabase Auth FK insert failed");

  // FK 1 negative: valid Auth user, missing Bridge profile must be rejected.
  await expectSqlState(
    `insert into bridge_loop_identity_links
      (bridge_user_id, auth_user_id, verification_method, verified_at, verified_by)
     values ($1, $2::uuid, 'supabase_auth_onboarding', now(), $1)`,
    [`missing-${randomUUID()}`, authUserId],
    "23503",
    "Bridge-profile FK orphan rejection",
  );

  // FK 2 negative: valid Bridge profile, missing Supabase Auth user must be rejected.
  const secondBridgeUserId = `scope-a-${randomUUID()}`;
  await client.query(
    `insert into bridge_profiles
      (user_id, email, display_name, account_type, email_verified)
     values ($1, $2, 'Scope A FK test', 'independent_creator', true)`,
    [secondBridgeUserId, `fk-test-${randomUUID()}@example.test`],
  );
  await expectSqlState(
    `insert into bridge_loop_identity_links
      (bridge_user_id, auth_user_id, verification_method, verified_at, verified_by)
     values ($1, $2::uuid, 'supabase_auth_onboarding', now(), $1)`,
    [secondBridgeUserId, randomUUID()],
    "23503",
    "Supabase Auth FK orphan rejection",
  );

  // The two identity dimensions are each unique.
  await expectSqlState(
    `insert into bridge_loop_identity_links
      (bridge_user_id, auth_user_id, verification_method, verified_at, verified_by)
     values ($1, $2::uuid, 'supabase_auth_onboarding', now(), $1)`,
    [secondBridgeUserId, authUserId],
    "23505",
    "Duplicate auth identity rejection",
  );

  // Bridge profile deletion is restricted while an identity link exists.
  await expectSqlState(
    "delete from bridge_profiles where user_id = $1",
    [bridgeUserId],
    "23503",
    "Bridge profile delete restriction",
  );

  // Supabase Auth deletion cascades only the link; it does not delete the Bridge profile.
  await client.query("delete from auth.users where id = $1::uuid", [authUserId]);
  const cascadedLinks = await scalar(
    "select count(*)::int as value from bridge_loop_identity_links where auth_user_id = $1::uuid",
    [authUserId],
  );
  const retainedProfile = await scalar(
    "select count(*)::int as value from bridge_profiles where user_id = $1",
    [bridgeUserId],
  );
  await assert(cascadedLinks === 0, "Auth-user delete did not cascade to identity link");
  await assert(retainedProfile === 1, "Auth-user delete unexpectedly removed Bridge profile");

  let sameEmailBlocked = false;
  try {
    await client.query(
      `insert into bridge_profiles
        (user_id, email, display_name, account_type, organization_name, internal_role, email_verified)
       values ($1, $2, 'Conflict', 'independent_creator', null, null, true)`,
      [`scope-a-${randomUUID()}`, email],
    );
  } catch (error) {
    sameEmailBlocked = error?.code === "23505";
  }
  await assert(sameEmailBlocked, "same-email foreign profile was not blocked by unique index");

  const rollbackId = `scope-a-${randomUUID()}`;
  await client.query("begin");
  await client.query(
    `insert into bridge_profiles
      (user_id, email, display_name, account_type, organization_name, internal_role, email_verified)
     values ($1, $2, 'Rollback', 'independent_creator', null, null, true)`,
    [rollbackId, `rollback-${randomUUID()}@example.test`],
  );
  await client.query("rollback");

  const rollbackRows = await scalar(
    "select count(*)::int as value from bridge_profiles where user_id = $1",
    [rollbackId],
  );
  await assert(rollbackRows === 0, "transaction rollback assertion failed");

  const finalInvites = await scalar("select count(*)::int as value from bridge_invites");
  await assert(finalInvites === beforeInvites, "invite row count changed unexpectedly");

  console.log(JSON.stringify({
    environment: "DISPOSABLE LOCAL POSTGRESQL ONLY",
    database: databaseName,
    before: {
      bridge_profiles: beforeProfiles,
      bridge_loop_identity_links: beforeLinks,
      bridge_invites: beforeInvites,
    },
    after_setup: {
      bridge_profiles: afterProfiles,
      bridge_loop_identity_links: afterLinks,
    },
    assertions: {
      valid_bridge_profile_fk: "passed",
      valid_supabase_auth_fk: "passed",
      missing_bridge_profile_rejected_23503: "passed",
      missing_supabase_auth_user_rejected_23503: "passed",
      duplicate_auth_identity_rejected_23505: "passed",
      bridge_profile_delete_restricted_23503: "passed",
      auth_user_delete_cascades_link: "passed",
      auth_user_delete_preserves_bridge_profile: "passed",
      same_email_unique_conflict: "passed",
      transaction_rollback: "passed",
      invite_count_stable: "passed",
    },
  }));
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
