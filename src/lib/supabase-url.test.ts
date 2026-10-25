import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalSupabaseUrl } from "./supabase-url.ts";

test("canonical Supabase URL trims whitespace and trailing slashes", () => {
  assert.equal(resolveCanonicalSupabaseUrl("  https://example.supabase.co///  "), "https://example.supabase.co");
});

test("canonical Supabase URL is missing when VITE_SUPABASE_URL is absent or blank", () => {
  assert.equal(resolveCanonicalSupabaseUrl(undefined), undefined);
  assert.equal(resolveCanonicalSupabaseUrl("   "), undefined);
});
