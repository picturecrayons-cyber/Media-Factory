#!/usr/bin/env node
import assert from "node:assert/strict";
import pg from "pg";

const SOURCE_REF = "mlmgugivsyoxzdgwkbpu";
const TARGET_REF = "jbymleftneggcgutlcqu";
const TABLES = ["bridge_titles", "bridge_assets", "loop_titles"];
const POSTER_KINDS = ["poster", "horizontal_poster", "vertical_poster", "thumbnail"];

function projectRef(value, label) {
  let url;
  try { url = new URL(value); } catch { throw new Error(label + " is not a valid database URL"); }
  const host = url.hostname;
  const ref = host.split(".")[0];
  if (!host.endsWith(".supabase.co") || !ref) throw new Error(label + " must use a Supabase project hostname");
  return ref;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Missing required environment variable: " + name);
  return value;
}

function safeConnection(url) {
  return new pg.Pool({ connectionString: url, max: 1, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
}

async function columns(pool, table) {
  const result = await pool.query(
    "select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position",
    [table],
  );
  return result.rows.map((row) => row.column_name);
}

async function count(pool, table, where = "", params = []) {
  const result = await pool.query("select count(*)::int as count from public." + table + (where ? " where " + where : ""), params);
  return result.rows[0].count;
}

async function main() {
  if (process.env.CATALOG_SYNC_MODE !== "preflight") {
    throw new Error("Set CATALOG_SYNC_MODE=preflight. This tool is read-only and has no write mode.");
  }
  const sourceUrl = requireEnv("CATALOG_SYNC_SOURCE_DATABASE_URL");
  const targetUrl = requireEnv("CATALOG_SYNC_TEST_DATABASE_URL");
  const testOwnerId = requireEnv("CATALOG_SYNC_TEST_OWNER_USER_ID");
  assert.equal(projectRef(sourceUrl, "Production database URL"), SOURCE_REF, "Source must be the approved Production project");
  assert.equal(projectRef(targetUrl, "Testing database URL"), TARGET_REF, "Target must be the approved Testing project");

  const source = safeConnection(sourceUrl);
  const target = safeConnection(targetUrl);
  try {
    const [sourceIdentity, targetIdentity] = await Promise.all([
      source.query("select current_database() as database"),
      target.query("select current_database() as database"),
    ]);
    assert.ok(sourceIdentity.rows[0].database);
    assert.ok(targetIdentity.rows[0].database);

    const owner = await target.query(
      "select account_type from public.bridge_profiles where user_id = $1 limit 1",
      [testOwnerId],
    );
    if (owner.rows.length !== 1 || owner.rows[0].account_type !== "studio") {
      throw new Error("Testing owner mapping must point to an existing Testing studio profile");
    }

    const productionOwners = await source.query(
      "select count(*)::int as count from public.bridge_titles where owner_user_id = $1",
      [testOwnerId],
    );
    if (productionOwners.rows[0].count !== 0) {
      throw new Error("Testing owner ID overlaps a Production title owner; refusing identity reuse");
    }

    const report = {
      status: "PREFLIGHT_ONLY",
      sourceProject: SOURCE_REF,
      targetProject: TARGET_REF,
      productionWriteOperations: 0,
      testingWriteOperations: 0,
      ownerMapping: "validated-existing-testing-studio",
      tables: {},
      schemaDifferences: {},
      posterAssetKindsIncluded: POSTER_KINDS,
      excludedAssetKinds: ["master", "screener", "subtitle", "censor_certificate", "rights_document", "trailer"],
      copiedObjects: 0,
    };

    for (const table of TABLES) {
      const [sourceColumns, targetColumns] = await Promise.all([
        columns(source, table),
        columns(target, table),
      ]);
      if (!sourceColumns.length || !targetColumns.length) throw new Error("Required table missing: " + table);
      report.schemaDifferences[table] = {
        sourceOnly: sourceColumns.filter((name) => !targetColumns.includes(name)),
        targetOnly: targetColumns.filter((name) => !sourceColumns.includes(name)),
      };
      report.tables[table] = {
        productionRows: await count(source, table),
        testingRows: await count(target, table),
        sourceColumnCount: sourceColumns.length,
        targetColumnCount: targetColumns.length,
      };
    }
    report.tables.poster_assets = {
      productionRows: await count(source, "bridge_assets", "kind = any($1::text[])", [POSTER_KINDS]),
      testingRows: await count(target, "bridge_assets", "kind = any($1::text[])", [POSTER_KINDS]),
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
}

main().catch((error) => {
  console.error("CATALOG_SYNC_PREFLIGHT_BLOCKED:", error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
});
