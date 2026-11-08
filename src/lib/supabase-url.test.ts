import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDatabaseUrlForRuntime,
  assertSupabaseUrlForRuntime,
  PRODUCTION_SUPABASE_REF,
  resolveCanonicalSupabaseUrl,
  STAGING_SUPABASE_REF,
} from "./supabase-url.ts";

test("canonical Supabase URL trims whitespace and trailing slashes", () => {
  assert.equal(resolveCanonicalSupabaseUrl("  https://example.supabase.co///  "), "https://example.supabase.co");
});

test("canonical Supabase URL accepts either supported alias", () => {
  assert.equal(resolveCanonicalSupabaseUrl(undefined, "https://example.supabase.co"), "https://example.supabase.co");
  assert.equal(resolveCanonicalSupabaseUrl("https://example.supabase.co", undefined), "https://example.supabase.co");
});

test("canonical Supabase URL accepts matching aliases together", () => {
  assert.equal(
    resolveCanonicalSupabaseUrl("https://example.supabase.co/", " https://example.supabase.co "),
    "https://example.supabase.co",
  );
});

test("canonical Supabase URL fails closed when aliases point at different projects", () => {
  assert.throws(
    () => resolveCanonicalSupabaseUrl("https://production.supabase.co", "https://staging.supabase.co"),
    /CONFIG_MISSING/,
  );
});

test("canonical Supabase URL is missing when all aliases are absent or blank", () => {
  assert.equal(resolveCanonicalSupabaseUrl(undefined, "   "), undefined);
});

test("Vercel Preview and Development require the exact STAGING DB / Testing Supabase URL", () => {
  const stagingUrl = `https://${STAGING_SUPABASE_REF}.supabase.co`;
  assert.equal(assertSupabaseUrlForRuntime(stagingUrl, "preview"), stagingUrl);
  assert.equal(assertSupabaseUrlForRuntime(stagingUrl, "development"), stagingUrl);
  assert.throws(
    () => assertSupabaseUrlForRuntime(`https://${PRODUCTION_SUPABASE_REF}.supabase.co`, "preview"),
    /STAGING DB/,
  );
  assert.throws(
    () => assertSupabaseUrlForRuntime("https://bbtrosuwisnxacuxvegt.supabase.co", "preview"),
    /STAGING DB/,
  );
});

test("Vercel Production requires the exact canonical PRODUCTION DB Supabase URL", () => {
  const productionUrl = `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
  assert.equal(assertSupabaseUrlForRuntime(productionUrl, "production"), productionUrl);
  assert.throws(
    () => assertSupabaseUrlForRuntime(`https://${STAGING_SUPABASE_REF}.supabase.co`, "production"),
    /PRODUCTION DB/,
  );
});

test("Vercel Supabase URL validation rejects missing, malformed, HTTP and unknown environment bindings", () => {
  assert.throws(() => assertSupabaseUrlForRuntime(undefined, "preview"), /STAGING DB/);
  assert.throws(() => assertSupabaseUrlForRuntime("not-a-url", "preview"), /invalid/);
  assert.throws(() => assertSupabaseUrlForRuntime("http://jbymleftneggcgutlcqu.supabase.co", "preview"), /STAGING DB/);
  assert.throws(() => assertSupabaseUrlForRuntime("https://jbymleftneggcgutlcqu.supabase.co", "custom"), /unsupported/);
});

test("Vercel Preview Postgres binding accepts only direct or project-qualified Testing DB connections", () => {
  const direct = "postgresql://postgres:secret@db.jbymleftneggcgutlcqu.supabase.co:5432/postgres";
  const pooler = "postgresql://postgres.jbymleftneggcgutlcqu:secret@aws-0-ap-south-1.pooler.supabase.com:6543/postgres";
  assert.equal(assertDatabaseUrlForRuntime(direct, "preview"), direct);
  assert.equal(assertDatabaseUrlForRuntime(pooler, "preview"), pooler);
  assert.throws(
    () => assertDatabaseUrlForRuntime("postgresql://postgres:secret@db.mlmgugivsyoxzdgwkbpu.supabase.co:5432/postgres", "preview"),
    /STAGING DB/,
  );
  assert.throws(
    () => assertDatabaseUrlForRuntime("postgresql://postgres:secret@db.bbtrosuwisnxacuxvegt.supabase.co:5432/postgres", "preview"),
    /STAGING DB/,
  );
});

test("Vercel Production Postgres binding requires the canonical Production project", () => {
  const direct = "postgresql://postgres:secret@db.mlmgugivsyoxzdgwkbpu.supabase.co:5432/postgres";
  assert.equal(assertDatabaseUrlForRuntime(direct, "production"), direct);
  assert.throws(
    () => assertDatabaseUrlForRuntime("postgresql://postgres:secret@db.jbymleftneggcgutlcqu.supabase.co:5432/postgres", "production"),
    /PRODUCTION DB/,
  );
});

test("Vercel Postgres binding fails closed for missing, malformed and unrecognized hosts", () => {
  assert.throws(() => assertDatabaseUrlForRuntime(undefined, "preview"), /STAGING DB/);
  assert.throws(() => assertDatabaseUrlForRuntime("postgres://bad", "preview"), /STAGING DB/);
  assert.throws(
    () => assertDatabaseUrlForRuntime("postgres://postgres:secret@localhost:5432/postgres", "preview"),
    /STAGING DB/,
  );
});
