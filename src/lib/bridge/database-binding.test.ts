import assert from "node:assert/strict";
import test from "node:test";
import { resolveBridgeDatabaseUrl } from "./database-binding.ts";

const projectRef = "jbymleftneggcgutlcqu";
const stagingApi = `https://${projectRef}.supabase.co`;
const directUrl = `postgresql://postgres:example@db.${projectRef}.supabase.co:5432/postgres`;
const poolerUrl = `postgresql://postgres.${projectRef}:example@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`;

test("Preview refuses an unset database target instead of falling through to a configured database", () => {
  assert.throws(
    () => resolveBridgeDatabaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: directUrl, SUPABASE_URL: stagingApi }),
    /BRIDGE_DATABASE_TARGET must explicitly equal staging/,
  );
});

test("Preview refuses any target other than the explicitly approved staging target", () => {
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

test("STAGING Preview requires a database URL and a project URL", () => {
  assert.throws(
    () => resolveBridgeDatabaseUrl({ VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging", SUPABASE_URL: stagingApi }),
    /DATABASE_URL or POSTGRES_URL/,
  );
  assert.throws(
    () => resolveBridgeDatabaseUrl({ VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging", DATABASE_URL: directUrl }),
    /valid STAGING Supabase URL/,
  );
});

test("STAGING Preview accepts a direct database host matching the configured project", () => {
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

test("STAGING Preview accepts a pooler username that identifies the configured project", () => {
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

test("STAGING Preview rejects a database binding for a different Supabase project", () => {
  const otherProjectUrl = "postgresql://postgres:example@db.mlmgugivsyoxzdgwkbpu.supabase.co:5432/postgres";
  assert.throws(
    () => resolveBridgeDatabaseUrl({
      VERCEL_ENV: "preview",
      BRIDGE_DATABASE_TARGET: "staging",
      DATABASE_URL: otherProjectUrl,
      SUPABASE_URL: stagingApi,
    }),
    /does not match the configured STAGING Supabase project/,
  );
});

test("Production and local environments retain their explicitly configured binding", () => {
  assert.equal(resolveBridgeDatabaseUrl({ VERCEL_ENV: "production", DATABASE_URL: directUrl }), directUrl);
  assert.equal(resolveBridgeDatabaseUrl({ DATABASE_URL: directUrl }), directUrl);
});
