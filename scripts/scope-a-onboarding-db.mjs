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
const databaseName = decodeURIComponent(parsed.pathname.slice(1));
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

function assert(condition, message) {
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
  }
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
  assert(
    actualCode === expectedCode,
    `${label}: expected SQLSTATE ${expectedCode}, received ${actualCode ?? "no error"}`,
  );
}

let transactionOpen = false;
try {
  await client.query("begin");
  transactionOpen = true;

  const beforeProfiles = await scalar("select count(*)::int as value from bridge_profiles");
  const beforeLinks = await scalar("select count(*)::int as value from bridge_loop_identity_links");
  const beforeInvites = await scalar("select count(*)::int as value from bridge_invites");

  const authUserId = randomUUID();
  const unlinkedAuthUserId = randomUUID();
  const bridgeUserId = `scope-a-${randomUUID()}`;
  const email = `scope-a-${randomUUID()}@example.test`;

  // All writes occur inside one outer transaction and are rolled back at the end.
  await client.query(
    "insert into auth.users (id) values ($1::uuid), ($2::uuid)",
    [authUserId, unlinkedAuthUserId],
  );
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

  const afterProfiles = await scalar("select count(*)::int as value from bridge_profiles");
  const afterLinks = await scalar("select count(*)::int as value from bridge_loop_identity_links");
  assert(afterProfiles === beforeProfiles + 1, "valid Bridge profile FK insert failed");
  assert(afterLinks === beforeLinks + 1, "valid Supabase Auth FK insert failed");

  await expectSqlState(
    `insert into bridge_loop_identity_links
      (bridge_user_id, auth_user_id, verification_method, verified_at, verified_by)
     values ($1, $2::uuid, 'supabase_auth_onboarding', now(), $1)`,
    [`missing-${randomUUID()}`, unlinkedAuthUserId],
    "23503",
    "Bridge-profile FK orphan rejection",
  );

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

  await expectSqlState(
    `insert into bridge_loop_identity_links
      (bridge_user_id, auth_user_id, verification_method, verified_at, verified_by)
     values ($1, $2::uuid, 'supabase_auth_onboarding', now(), $1)`,
    [secondBridgeUserId, authUserId],
    "23505",
    "Duplicate auth identity rejection",
  );

  await expectSqlState(
    "delete from bridge_profiles where user_id = $1",
    [bridgeUserId],
    "23503",
    "Bridge profile delete restriction",
  );

  await client.query("delete from auth.users where id = $1::uuid", [authUserId]);
  const cascadedLinks = await scalar(
    "select count(*)::int as value from bridge_loop_identity_links where auth_user_id = $1::uuid",
    [authUserId],
  );
  const retainedProfile = await scalar(
    "select count(*)::int as value from bridge_profiles where user_id = $1",
    [bridgeUserId],
  );
  assert(cascadedLinks === 0, "Auth-user delete did not cascade to identity link");
  assert(retainedProfile === 1, "Auth-user delete unexpectedly removed Bridge profile");

  const sameEmailSavepoint = `sp_email_${randomUUID().replaceAll("-", "")}`;
  await client.query(`savepoint ${sameEmailSavepoint}`);
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
  await client.query(`rollback to savepoint ${sameEmailSavepoint}`);
  await client.query(`release savepoint ${sameEmailSavepoint}`);
  assert(sameEmailBlocked, "same-email foreign profile was not blocked by unique index");

  const rollbackId = `scope-a-${randomUUID()}`;
  const rollbackSavepoint = `sp_rollback_${randomUUID().replaceAll("-", "")}`;
  await client.query(`savepoint ${rollbackSavepoint}`);
  await client.query(
    `insert into bridge_profiles
      (user_id, email, display_name, account_type, organization_name, internal_role, email_verified)
     values ($1, $2, 'Rollback', 'independent_creator', null, null, true)`,
    [rollbackId, `rollback-${randomUUID()}@example.test`],
  );
  await client.query(`rollback to savepoint ${rollbackSavepoint}`);
  await client.query(`release savepoint ${rollbackSavepoint}`);
  const rollbackRows = await scalar(
    "select count(*)::int as value from bridge_profiles where user_id = $1",
    [rollbackId],
  );
  assert(rollbackRows === 0, "transaction rollback assertion failed");

  const finalInvites = await scalar("select count(*)::int as value from bridge_invites");
  assert(finalInvites === beforeInvites, "invite row count changed unexpectedly");

  console.log(JSON.stringify({
    environment: "DISPOSABLE LOCAL POSTGRESQL ONLY",
    database: databaseName,
    before: {
      bridge_profiles: beforeProfiles,
      bridge_loop_identity_links: beforeLinks,
      bridge_invites: beforeInvites,
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
    cleanup: "outer transaction rolled back; no rows persisted",
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
  if (transactionOpen) {
    await client.query("rollback").catch(() => {});
  }
  await client.end();
}
