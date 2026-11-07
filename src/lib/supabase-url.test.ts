import assert from "node:assert/strict";
import test from "node:test";
import { resolveCanonicalSupabaseUrl } from "./supabase-url.ts";
import { resolveDatabaseUrlCandidate } from "./database-url.ts";

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


test("database URL resolution skips empty primary values and falls back to the next configured alias", () => {
  assert.equal(
    resolveDatabaseUrlCandidate({
      DATABASE_URL: "",
      POSTGRES_URL: " postgres://staging.example/db ",
      SUPABASE_DB_URL: "postgres://later.example/db",
    }),
    "postgres://staging.example/db",
  );
});

test("database URL resolution skips whitespace-only values", () => {
  assert.equal(
    resolveDatabaseUrlCandidate({
      DATABASE_URL: "   ",
      POSTGRES_URL: "\t",
      SUPABASE_DB_URL: "postgresql://staging.example/db",
    }),
    "postgresql://staging.example/db",
  );
});

test("database URL resolution returns undefined when all aliases are empty", () => {
  assert.equal(
    resolveDatabaseUrlCandidate({
      DATABASE_URL: "",
      POSTGRES_URL: "  ",
      SUPABASE_DB_URL: undefined,
      SUPABASE_DATABASE_URL: "",
    }),
    undefined,
  );
});
