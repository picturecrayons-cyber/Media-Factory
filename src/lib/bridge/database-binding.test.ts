import assert from "node:assert/strict";
import test from "node:test";
import { resolveBridgeDatabaseUrl } from "./database-binding.ts";

const stagingRef = "jbymleftneggcgutlcqu";
const productionRef = "mlmgugivsyoxzdgwkbpu";
const stagingApi = `https://${stagingRef}.supabase.co`;
const productionApi = `https://${productionRef}.supabase.co`;
const directUrl = (ref: string) => `postgresql://postgres:example@db.${ref}.supabase.co:5432/postgres`;
const poolerUrl = `postgresql://postgres.${stagingRef}:example@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

test("Preview refuses an unset database target instead of falling through", () => {
  assert.throws(
    () => resolveBridgeDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: directUrl(stagingRef), SUPABASE_URL: stagingApi }),
    /BRIDGE_DATABASE_TARGET must explicitly equal staging/,
  );
});

test("Preview refuses any target other than explicitly approved staging", () => {
  assert.throws(
    () => resolveBridgeDatabaseUrl({
      VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "production",
      DATABASE_URL: directUrl(stagingRef), SUPABASE_URL: stagingApi,
    }),
    /Production database fallback is forbidden/,
  );
});

test("Preview requires both database and Supabase project URLs", () => {
  assert.throws(
    () => resolveBridgeDatabaseUrl({ VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging", SUPABASE_URL: stagingApi }),
    /PostgreSQL database URL/,
  );
  assert.throws(
    () => resolveBridgeDatabaseUrl({ VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging", DATABASE_URL: directUrl(stagingRef) }),
    /approved Supabase project URL/,
  );
});

test("Preview accepts the approved Testing DB direct connection", () => {
  assert.equal(resolveBridgeDatabaseUrl({
    VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging",
    DATABASE_URL: directUrl(stagingRef), SUPABASE_URL: stagingApi,
  }), directUrl(stagingRef));
});

test("Preview accepts the approved Testing DB pooler username", () => {
  assert.equal(resolveBridgeDatabaseUrl({
    VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging",
    DATABASE_URL: poolerUrl, SUPABASE_URL: stagingApi,
  }), poolerUrl);
});

test("Preview rejects the Production database even when the STAGING target is selected", () => {
  assert.throws(
    () => resolveBridgeDatabaseUrl({
      VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging",
      DATABASE_URL: directUrl(productionRef), SUPABASE_URL: stagingApi,
    }),
    /does not match the approved STAGING/,
  );
});

test("Preview rejects an unknown project ref", () => {
  const unknownRef = "aaaaaaaaaaaaaaaaaaaa";
  assert.throws(
    () => resolveBridgeDatabaseUrl({
      VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging",
      DATABASE_URL: directUrl(unknownRef), SUPABASE_URL: stagingApi,
    }),
    /does not match the approved STAGING/,
  );
});

test("Production accepts only the canonical Production project", () => {
  assert.equal(resolveBridgeDatabaseUrl({
    VERCEL_ENV: "production", DATABASE_URL: directUrl(productionRef), SUPABASE_URL: productionApi,
  }), directUrl(productionRef));
  assert.throws(
    () => resolveBridgeDatabaseUrl({
      VERCEL_ENV: "production", DATABASE_URL: directUrl(stagingRef), SUPABASE_URL: stagingApi,
    }),
    /approved Supabase project URL/,
  );
  assert.throws(
    () => resolveBridgeDatabaseUrl({
      VERCEL_ENV: "production", DATABASE_URL: directUrl(stagingRef), SUPABASE_URL: productionApi,
    }),
    /does not match the approved Production/,
  );
});

test("Local environments preserve their configured binding", () => {
  assert.equal(resolveBridgeDatabaseUrl({ DATABASE_URL: directUrl(stagingRef) }), directUrl(stagingRef));
});
