import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalSupabaseUrl } from "./supabase-url.ts";

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
