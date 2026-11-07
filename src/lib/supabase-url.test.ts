import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalSupabaseUrl, resolveEnvironmentSupabaseUrl } from "./supabase-url.ts";

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


test("Bridge Preview can use only the Testing database", () => {
  assert.equal(
    resolveEnvironmentSupabaseUrl("preview", "https://jbymleftneggcgutlcqu.supabase.co"),
    "https://jbymleftneggcgutlcqu.supabase.co",
  );
  assert.throws(
    () => resolveEnvironmentSupabaseUrl("preview", "https://mlmgugivsyoxzdgwkbpu.supabase.co"),
    /isolated Supabase project/,
  );
});

test("Bridge Production can use only the Production database", () => {
  assert.equal(
    resolveEnvironmentSupabaseUrl("production", "https://mlmgugivsyoxzdgwkbpu.supabase.co"),
    "https://mlmgugivsyoxzdgwkbpu.supabase.co",
  );
  assert.throws(
    () => resolveEnvironmentSupabaseUrl("production", "https://jbymleftneggcgutlcqu.supabase.co"),
    /isolated Supabase project/,
  );
});

test("Bridge rejects unknown deployment environments and unapproved development targets", () => {
  assert.throws(
    () => resolveEnvironmentSupabaseUrl("custom", "https://jbymleftneggcgutlcqu.supabase.co"),
    /Unknown Supabase deployment environment/,
  );
  assert.throws(
    () => resolveEnvironmentSupabaseUrl("development", "https://mlmgugivsyoxzdgwkbpu.supabase.co"),
    /isolated Supabase project/,
  );
});
