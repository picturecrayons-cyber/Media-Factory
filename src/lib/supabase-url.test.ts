import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveCanonicalSupabaseUrl,
  resolveEnvironmentScopedSupabaseUrl,
} from "./supabase-url.ts";

const testingUrl = "https://jbymleftneggcgutlcqu.supabase.co";
const productionUrl = "https://mlmgugivsyoxzdgwkbpu.supabase.co";

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
    () => resolveCanonicalSupabaseUrl(productionUrl, testingUrl),
    /CONFIG_MISSING/,
  );
});

test("canonical Supabase URL is missing when all aliases are absent or blank", () => {
  assert.equal(resolveCanonicalSupabaseUrl(undefined, "   "), undefined);
});

test("Preview accepts only the Testing project", () => {
  assert.equal(resolveEnvironmentScopedSupabaseUrl("preview", testingUrl), testingUrl);
  assert.throws(
    () => resolveEnvironmentScopedSupabaseUrl("preview", productionUrl),
    /does not match this deployment environment/,
  );
});

test("Production accepts only the Production project", () => {
  assert.equal(resolveEnvironmentScopedSupabaseUrl("production", productionUrl), productionUrl);
  assert.throws(
    () => resolveEnvironmentScopedSupabaseUrl("production", testingUrl),
    /does not match this deployment environment/,
  );
});

test("environment-scoped resolver rejects missing URLs and unknown environments", () => {
  assert.throws(
    () => resolveEnvironmentScopedSupabaseUrl("preview", undefined, " "),
    /Supabase URL configuration is missing/,
  );
  assert.throws(
    () => resolveEnvironmentScopedSupabaseUrl(undefined, testingUrl),
    /deployment environment must be preview or production/,
  );
});

test("environment-scoped resolver rejects non-HTTPS and lookalike hosts", () => {
  assert.throws(
    () => resolveEnvironmentScopedSupabaseUrl("preview", "http://jbymleftneggcgutlcqu.supabase.co"),
    /does not match this deployment environment/,
  );
  assert.throws(
    () => resolveEnvironmentScopedSupabaseUrl("preview", "https://jbymleftneggcgutlcqu.supabase.co.attacker.example"),
    /does not match this deployment environment/,
  );
});

test("environment-scoped resolver rejects paths, query strings, fragments, credentials, and custom ports", () => {
  const invalidUrls = [
    "https://jbymleftneggcgutlcqu.supabase.co/rest/v1",
    "https://jbymleftneggcgutlcqu.supabase.co/?redirect=elsewhere",
    "https://jbymleftneggcgutlcqu.supabase.co/#fragment",
    "https://user:pass@jbymleftneggcgutlcqu.supabase.co",
    "https://jbymleftneggcgutlcqu.supabase.co:8443",
  ];
  for (const url of invalidUrls) {
    assert.throws(
      () => resolveEnvironmentScopedSupabaseUrl("preview", url),
      /URL structure or project/,
      url,
    );
  }
});
