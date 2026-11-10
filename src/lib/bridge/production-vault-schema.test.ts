import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Production Vault migration creates server-only relational workflow tables", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create table bridge_titles (id text primary key);
      create table bridge_profiles (user_id text primary key);
      create table bridge_organizations (id uuid primary key);
    `);
    const migration = await readFile(
      new URL("../../../migrations/0023_bridge_production_vault.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    const tables = await db.query<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname like 'bridge_production%'
        and c.relkind = 'r'
      order by c.relname
    `);
    assert.equal(tables.rows.length, 9);
    assert.ok(tables.rows.every((table) => table.relrowsecurity), "every vault table must enable RLS");
    const browserPrivileges = await db.query<{ table_name: string; grantee: string }>(`
      select table_name, grantee
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name like 'bridge_production%'
        and grantee in ('anon', 'authenticated', 'PUBLIC')
    `);
    assert.equal(browserPrivileges.rows.length, 0, "browser roles must have no vault table grants");
    const copyConstraints = await db.query<{ constraint_name: string }>(`
      select constraint_name from information_schema.table_constraints
      where table_schema = 'public' and table_name = 'bridge_production_copy_verifications'
    `);
    assert.ok(copyConstraints.rows.some((row) => row.constraint_name.includes("unique")));
  } finally {
    await db.close();
  }
});
