import pg from "pg";

const { Client } = pg;
const connectionString =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;

function requireDisposableLocalDatabase(value) {
  if (process.env.SCOPE_A_DISPOSABLE_DATABASE !== "1") {
    throw new Error("Refusing to run: SCOPE_A_DISPOSABLE_DATABASE=1 is required");
  }
  if (!value) throw new Error("Disposable PostgreSQL connection string is required");
  const url = new URL(value);
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!localHosts.has(url.hostname) || database !== "bridge_scope_a") {
    throw new Error(
      "Refusing to run: Scope A accepts only the local bridge_scope_a disposable database",
    );
  }
}

requireDisposableLocalDatabase(connectionString);

const client = new Client({ connectionString });
await client.connect();

async function scalar(sql, params = []) {
  const result = await client.query(sql, params);
  return Number(result.rows[0]?.value ?? 0);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const requiredMigrations = [
  "0001_auth.sql",
  "0004_bridge.sql",
  "0007a_identity_links.sql",
];

const trackedTables = [
  "auth.users",
  'public."user"',
  "public.bridge_profiles",
  "public.bridge_loop_identity_links",
  "public.bridge_invites",
];

const counts = async () => ({
  authUsers: await scalar("select count(*)::int as value from auth.users"),
  legacyUsers: await scalar('select count(*)::int as value from public."user"'),
  profiles: await scalar("select count(*)::int as value from public.bridge_profiles"),
  identityLinks: await scalar(
    "select count(*)::int as value from public.bridge_loop_identity_links",
  ),
  invites: await scalar("select count(*)::int as value from public.bridge_invites"),
});

let transactionOpen = false;
let baseline;
let inTransaction;
let finalCounts;
let errorOutput;

try {
  // Prove that the workflow replayed the actual migration files. A log label
  // alone is not accepted as evidence of migration replay.
  const migrationRows = await client.query(
    "select name from public._migrations where name = any($1::text[])",
    [requiredMigrations],
  );
  const applied = new Set(migrationRows.rows.map((row) => row.name));
  const missing = requiredMigrations.filter((name) => !applied.has(name));
  assert(missing.length === 0, `Required migrations were not applied: ${missing.join(", ")}`);

  for (const table of trackedTables) {
    const [schema, name] = table.includes(".")
      ? table.split(".", 2)
      : ["public", table];
    const exists = await client.query(
      "select to_regclass($1) is not null as present",
      [`${schema}.${name}`],
    );
    assert(exists.rows[0]?.present === true, `Required relation missing: ${table}`);
  }

  // Verify the checked-in migration's actual FK targets. This deliberately
  // does not silently rewrite the unresolved Better Auth FK design.
  const foreignKeys = await client.query(`
    select
      conname,
      confrelid::regclass::text as referenced_table,
      pg_get_constraintdef(oid) as definition
    from pg_constraint
    where conrelid = 'public.bridge_loop_identity_links'::regclass
      and contype = 'f'
  `);
  const fkTargets = new Set(foreignKeys.rows.map((row) => row.referenced_table));
  assert(fkTargets.has('"user"') || fkTargets.has("user"), "Identity FK to public.user is missing");
  assert(fkTargets.has("auth.users"), "Identity FK to auth.users is missing");

  baseline = await counts();

  await client.query("begin");
  transactionOpen = true;

  const userId = `scope-a-${crypto.randomUUID()}`;
  const authUserId = crypto.randomUUID();
  const email = `scope-a-${crypto.randomUUID()}@example.test`;

  await client.query(
    'insert into public."user" ("id", "name", "email", "emailVerified") values ($1, $2, $3, true)',
    [userId, "Scope A disposable test", email],
  );
  await client.query("insert into auth.users (id) values ($1::uuid)", [authUserId]);
  await client.query(
    `insert into public.bridge_profiles
      (user_id, email, display_name, account_type, organization_name, internal_role, email_verified)
     values ($1, $2, 'Scope A disposable test', 'independent_creator', null, null, true)`,
    [userId, email],
  );
  await client.query(
    `insert into public.bridge_loop_identity_links
      (bridge_user_id, auth_user_id, verification_method, verified_at, verified_by)
     values ($1, $2::uuid, 'verified_email_reauthentication', now(), $1)`,
    [userId, authUserId],
  );

  inTransaction = await counts();
  assert(inTransaction.authUsers === baseline.authUsers + 1, "Auth user insert assertion failed");
  assert(inTransaction.legacyUsers === baseline.legacyUsers + 1, "Better Auth user insert assertion failed");
  assert(inTransaction.profiles === baseline.profiles + 1, "Bridge profile insert assertion failed");
  assert(inTransaction.identityLinks === baseline.identityLinks + 1, "Identity link insert assertion failed");
  assert(inTransaction.invites === baseline.invites, "Invite count changed unexpectedly");

  // Expected unique-email violation must be isolated with a savepoint so the
  // test transaction remains usable and can be rolled back cleanly.
  await client.query("savepoint duplicate_email_test");
  let duplicateEmailBlocked = false;
  try {
    await client.query(
      `insert into public.bridge_profiles
        (user_id, email, display_name, account_type, organization_name, internal_role, email_verified)
       values ($1, $2, 'Conflict', 'independent_creator', null, null, true)`,
      [`scope-a-conflict-${crypto.randomUUID()}`, email],
    );
  } catch (error) {
    duplicateEmailBlocked = error?.code === "23505";
    await client.query("rollback to savepoint duplicate_email_test");
  }
  await client.query("release savepoint duplicate_email_test");
  assert(duplicateEmailBlocked, "Case-insensitive duplicate profile email was not blocked");

  // Test each FK independently: first a missing Better Auth user with a
  // valid Supabase Auth user, then a valid Better Auth user with a missing
  // Supabase Auth user.
  async function assertOrphanFkRejected(savepoint, bridgeUserId, authUserIdValue, message) {
    await client.query(`savepoint ${savepoint}`);
    let blocked = false;
    try {
      await client.query(
        `insert into public.bridge_loop_identity_links
          (bridge_user_id, auth_user_id, verification_method, verified_at, verified_by)
         values ($1, $2::uuid, 'verified_email_reauthentication', now(), $1)`,
        [bridgeUserId, authUserIdValue],
      );
    } catch (error) {
      blocked = error?.code === "23503";
      await client.query(`rollback to savepoint ${savepoint}`);
    }
    await client.query(`release savepoint ${savepoint}`);
    assert(blocked, message);
  }

  // Use a fresh, valid Auth user that is not already linked. Reusing
  // authUserId would hit the identity-link UNIQUE constraint (23505) before
  // PostgreSQL can evaluate the Better Auth user FK (expected 23503).
  const orphanCheckAuthUserId = crypto.randomUUID();
  await client.query("insert into auth.users (id) values ($1::uuid)", [orphanCheckAuthUserId]);

  await assertOrphanFkRejected(
    "missing_better_auth_user_test",
    `missing-user-${crypto.randomUUID()}`,
    orphanCheckAuthUserId,
    "Better Auth user foreign key did not reject an orphan reference",
  );
  await assertOrphanFkRejected(
    "missing_supabase_auth_user_test",
    userId,
    crypto.randomUUID(),
    "Supabase Auth user foreign key did not reject an orphan reference",
  );

  await client.query("rollback");
  transactionOpen = false;
  finalCounts = await counts();

  assert(
    JSON.stringify(finalCounts) === JSON.stringify(baseline),
    "Disposable test rows remained after rollback",
  );

  console.log(
    JSON.stringify({
      result: "PASS",
      database_guard: "local bridge_scope_a only",
      applied_migrations: requiredMigrations,
      verified_identity_fk_targets: [...fkTargets],
      assertions: {
        migration_prerequisites: "passed",
        auth_user_insert: "passed",
        better_auth_user_insert: "passed",
        bridge_profile_insert: "passed",
        identity_link_insert: "passed",
        duplicate_email_unique_constraint: "passed",
        orphan_identity_fk_rejection: "passed",
        invite_count_unchanged: "passed",
        complete_transaction_rollback: "passed",
      },
      baseline_counts: baseline,
      in_transaction_counts: inTransaction,
      after_rollback_counts: finalCounts,
    }),
  );
} catch (error) {
  errorOutput = {
    result: "FAIL",
    name: error?.name,
    message: error?.message,
    code: error?.code,
    constraint: error?.constraint,
    detail: error?.detail,
  };
  console.error(JSON.stringify(errorOutput));
  process.exitCode = 1;
} finally {
  if (transactionOpen) {
    try {
      await client.query("rollback");
    } catch {
      // Preserve the original test failure.
    }
  }
  await client.end();
}
