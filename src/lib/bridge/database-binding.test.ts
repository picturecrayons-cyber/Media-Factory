import assert from "node:assert/strict";
import test from "node:test";
import { resolveBridgeDatabaseUrl } from "./database-binding.ts";

const projectRef = "jbymleftneggcgutlcqu";
const stagingApi = `https://${projectRef}.supabase.co`;
const directUrl = `postgresql://postgres:example@db.${projectRef}.supabase.co:5432/postgres`;
const poolerUrl = `postgresql://postgres.${projectRef}:example@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

test("Preview refuses an unset database target instead of falling through", () => {
  assert.throws(
    () => resolveBridgeDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: directUrl, SUPABASE_URL: stagingApi }),
    /BRIDGE_DATABASE_TARGET must explicitly equal staging/,
  );
});

test("Preview refuses any target other than explicitly approved staging", () => {
  assert.throws(
    () => resolveBridgeDatabaseUrl({
      VERCEL_ENV: "preview",
      BRIDGE_DATABASE_TARGET: "production",
      DATABASE_URL: directUrl,
      SUPABASE_URL: stagingApi,
    }),
    /Production database fallback is forbidden/,
  );
});

test("Preview requires both a database URL and a project URL", () => {
  assert.throws(
    () => resolveBridgeDatabaseUrl({ VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging", SUPABASE_URL: stagingApi }),
    /DATABASE_URL or POSTGRES_URL/,
  );
  assert.throws(
    () => resolveBridgeDatabaseUrl({ VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging", DATABASE_URL: directUrl }),
    /valid STAGING Supabase URL/,
  );
});

test("Preview accepts a direct database host matching the approved Testing DB", () => {
  assert.equal(
    resolveBridgeDatabaseUrl({
      VERCEL_ENV: "preview",
      BRIDGE_DATABASE_TARGET: "staging",
      DATABASE_URL: directUrl,
      SUPABASE_URL: stagingApi,
    }),
    directUrl,
  );
});

test("Preview accepts a pooler username identifying the approved Testing DB", () => {
  assert.equal(
    resolveBridgeDatabaseUrl({
      VERCEL_ENV: "preview",
      BRIDGE_DATABASE_TARGET: "staging",
      DATABASE_URL: poolerUrl,
      SUPABASE_URL: stagingApi,
    }),
    poolerUrl,
  );
});

test("Preview rejects the Production database when configured for STAGING", () => {
  const productionUrl = "postgresql://postgres:example@db.mlmgugivsyoxzdgwkbpu.supabase.co:5432/postgres";
  assert.throws(
    () => resolveBridgeDatabaseUrl({
      VERCEL_ENV: "preview",
      BRIDGE_DATABASE_TARGET: "staging",
      DATABASE_URL: productionUrl,
      SUPABASE_URL: stagingApi,
    }),
    /does not match the configured STAGING Supabase project/,
  );
});

test("Preview rejects an unknown Supabase database project", () => {
  const unknownUrl = "postgresql://postgres:example@db.aaaaaaaaaaaaaaaaaaaa.supabase.co:5432/postgres";
  assert.throws(
    () => resolveBridgeDatabaseUrl({
      VERCEL_ENV: "preview",
      BRIDGE_DATABASE_TARGET: "staging",
      DATABASE_URL: unknownUrl,
      SUPABASE_URL: stagingApi,
    }),
    /does not match the configured STAGING Supabase project/,
  );
});

test("Production and local environments preserve their configured binding", () => {
  assert.equal(resolveBridgeDatabaseUrl({ VERCEL_ENV: "production", DATABASE_URL: directUrl }), directUrl);
  assert.equal(resolveBridgeDatabaseUrl({ DATABASE_URL: directUrl }), directUrl);
});
