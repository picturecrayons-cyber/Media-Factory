#!/usr/bin/env node
/**
 * Read-only inventory for the canonical Bridge Testing DB.
 *
 * This script intentionally performs catalog SELECTs only. It starts a
 * READ ONLY transaction, never seeds fixtures, never invokes application
 * workflows, and always rolls back. It does not certify Preview runtime
 * bindings; the operator must separately prove which deployment supplied
 * the connection string.
 */
import assert from "node:assert/strict";
import { Client } from "pg";

const REQUIRED_PROJECT_REF = "jbymleftneggcgutlcqu";

function requireCanonicalStagingEnvironment() {
  const projectRef = process.env.BRIDGE_STAGING_PROJECT_REF;
  const supabaseUrlText = process.env.BRIDGE_STAGING_SUPABASE_URL;
  const databaseUrlText = process.env.BRIDGE_STAGING_DATABASE_URL;

  assert.equal(
    projectRef,
    REQUIRED_PROJECT_REF,
    `Refusing to run: BRIDGE_STAGING_PROJECT_REF must equal ${REQUIRED_PROJECT_REF}.`,
  );
  assert.ok(supabaseUrlText, "Set BRIDGE_STAGING_SUPABASE_URL to the canonical Testing DB URL.");
  assert.ok(databaseUrlText, "Set BRIDGE_STAGING_DATABASE_URL to a read-only Testing DB connection.");

  const supabaseUrl = new URL(supabaseUrlText);
  assert.equal(
    supabaseUrl.hostname,
    `${REQUIRED_PROJECT_REF}.supabase.co`,
    "Refusing to run: Supabase URL is not the canonical Testing DB project.",
  );

  const databaseUrl = new URL(databaseUrlText);
  const directHost = databaseUrl.hostname === `db.${REQUIRED_PROJECT_REF}.supabase.co`;
  const poolerUser = databaseUrl.hostname.endsWith(".pooler.supabase.com") &&
    decodeURIComponent(databaseUrl.username).includes(REQUIRED_PROJECT_REF);
  assert.ok(
    directHost || poolerUser,
    "Refusing to run: database host/user does not prove the canonical Testing DB project.",
  );

  return databaseUrlText;
}

const queries = {
  database: `
    select current_database() as database_name,
           current_user as connected_role,
           current_setting('transaction_read_only') as transaction_read_only,
           current_setting('server_version') as server_version
  `,
  tables: `
    select n.nspname as schema_name, c.relname as table_name,
           c.relkind as relation_kind, c.reltuples::bigint as estimated_rows,
           c.relrowsecurity as rls_enabled, c.relforcerowsecurity as force_rls,
           (select count(*) from pg_policies p
             where p.schemaname = n.nspname and p.tablename = c.relname) as policy_count
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
     order by c.relkind, c.relname
  `,
  columns: `
    select table_name, ordinal_position, column_name, data_type,
           udt_schema, udt_name, is_nullable, column_default,
           is_identity, identity_generation, is_generated, generation_expression
      from information_schema.columns
     where table_schema = 'public'
     order by table_name, ordinal_position
  `,
  constraints: `
    select n.nspname as schema_name, t.relname as table_name,
           con.conname as constraint_name, con.contype as constraint_type,
           pg_get_constraintdef(con.oid, true) as definition
      from pg_constraint con
      join pg_class t on t.oid = con.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
     order by t.relname, con.conname
  `,
  indexes: `
    select schemaname, tablename, indexname, indexdef
      from pg_indexes where schemaname = 'public'
     order by tablename, indexname
  `,
  policies: `
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      from pg_policies where schemaname = 'public'
     order by tablename, policyname
  `,
  triggers: `
    select event_object_table as table_name, trigger_name, event_manipulation,
           action_timing, action_orientation, action_statement
      from information_schema.triggers
     where trigger_schema = 'public'
     order by event_object_table, trigger_name, event_manipulation
  `,
  views: `
    select schemaname, viewname, definition from pg_views
     where schemaname = 'public' order by viewname
  `,
  materializedViews: `
    select schemaname, matviewname, definition from pg_matviews
     where schemaname = 'public' order by matviewname
  `,
  tableGrants: `
    select table_schema, table_name, grantee, privilege_type, is_grantable
      from information_schema.role_table_grants
     where table_schema = 'public'
     order by table_name, grantee, privilege_type
  `,
  sequenceGrants: `
    select sequence_schema, sequence_name, grantee, privilege_type, is_grantable
      from information_schema.role_usage_grants
     where object_type = 'SEQUENCE' and object_schema = 'public'
     order by sequence_name, grantee, privilege_type
  `,
  routines: `
    select n.nspname as schema_name, p.proname as routine_name,
           pg_get_function_identity_arguments(p.oid) as identity_arguments,
           p.prokind as routine_kind, p.prosecdef as security_definer,
           p.proconfig as function_config,
           pg_get_userbyid(p.proowner) as owner,
           coalesce(json_agg(json_build_object(
             'role', r.rolname,
             'execute', has_function_privilege(r.oid, p.oid, 'EXECUTE')
           )) filter (where r.rolname is not null), '[]'::json) as role_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      left join pg_roles r on r.rolname in ('anon','authenticated','service_role','postgres')
     where n.nspname = 'public'
     group by n.nspname, p.proname, p.oid, p.prokind, p.prosecdef, p.proconfig, p.proowner
     order by p.proname, identity_arguments
  `,
  roleMemberships: `
    select parent.rolname as granted_role, member.rolname as member_role,
           grantor.rolname as grantor_role, m.admin_option
      from pg_auth_members m
      join pg_roles parent on parent.oid = m.roleid
      join pg_roles member on member.oid = m.member
      join pg_roles grantor on grantor.oid = m.grantor
     where parent.rolname in ('anon','authenticated','service_role','postgres')
        or member.rolname in ('anon','authenticated','service_role','postgres')
     order by granted_role, member_role
  `,
};

async function main() {
  const connectionString = requireCanonicalStagingEnvironment();
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: true },
    application_name: "bridge-testing-db-readonly-schema-audit",
    connectionTimeoutMillis: 10000,
  });

  await client.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN READ ONLY");
    transactionOpen = true;
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL lock_timeout = '3s'");

    const database = (await client.query(queries.database)).rows[0];
    assert.equal(database.transaction_read_only, "on", "Database transaction must be READ ONLY.");

    const inventory = { database, generatedAt: new Date().toISOString(), projectRef: REQUIRED_PROJECT_REF };
    for (const [name, sql] of Object.entries(queries)) {
      if (name === "database") continue;
      inventory[name] = (await client.query(sql)).rows;
    }

    const migrationTable = await client.query(
      "select to_regclass('supabase_migrations.schema_migrations') as migration_table",
    );
    if (migrationTable.rows[0].migration_table) {
      inventory.migrations = (await client.query(`
        select * from supabase_migrations.schema_migrations
         order by version
      `)).rows;
    } else {
      inventory.migrations = { status: "NOT FOUND", relation: "supabase_migrations.schema_migrations" };
    }

    console.log(JSON.stringify(inventory, null, 2));
    console.error("READ-ONLY AUDIT COMPLETE. No application rows, schema, grants, policies, or storage objects were changed.");
    console.error("This inventory does not prove Vercel Preview runtime binding or certify any release gate.");
    await client.query("ROLLBACK");
    transactionOpen = false;
  } finally {
    if (transactionOpen) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original failure */ }
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(`BLOCKED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
