import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_SUPABASE_REF,
  CANONICAL_SUPABASE_URL,
  FORBIDDEN_SUPABASE_REFS,
  assertCanonicalSupabaseUrl,
  databaseUrlLooksForbidden,
  TEST_AUTH_SUPABASE_REF,
  TEST_AUTH_SUPABASE_URL,
  resolveTestAuthSupabaseUrl,
} from "./canonical.ts";

describe("canonical supabase pin", () => {
  it("pins the owner-approved project and rejects the zip snapshot ref", () => {
    assert.equal(CANONICAL_SUPABASE_REF, "mlmgugivsyoxzdgwkbpu");
    assert.ok(FORBIDDEN_SUPABASE_REFS.includes("tqzimuwozhipqgyerdff"));
    assert.throws(
      () => assertCanonicalSupabaseUrl("https://tqzimuwozhipqgyerdff.supabase.co"),
      /Forbidden/,
    );
    assert.equal(databaseUrlLooksForbidden("postgres://x@db.tqzimuwozhipqgyerdff.supabase.co/postgres"), true);
    assert.equal(databaseUrlLooksForbidden("postgres://x@db.mlmgugivsyoxzdgwkbpu.supabase.co/postgres"), false);
  });
});

describe("isolated test Auth Supabase target", () => {
  it("pins the dedicated test project without changing the production pin", () => {
    assert.equal(TEST_AUTH_SUPABASE_REF, "jbymleftneggcgutlcqu");
    assert.equal(TEST_AUTH_SUPABASE_URL, "https://jbymleftneggcgutlcqu.supabase.co");
    assert.equal(CANONICAL_SUPABASE_REF, "mlmgugivsyoxzdgwkbpu");
    assert.notEqual(TEST_AUTH_SUPABASE_REF, CANONICAL_SUPABASE_REF);
  });

  it("requires an explicit enable flag and exact test URL plus publishable key", () => {
    assert.equal(
      resolveTestAuthSupabaseUrl(true, TEST_AUTH_SUPABASE_URL, "sb_publishable_test_key"),
      TEST_AUTH_SUPABASE_URL,
    );
    assert.throws(
      () => resolveTestAuthSupabaseUrl(false, TEST_AUTH_SUPABASE_URL, "sb_publishable_test_key"),
      /disabled/,
    );
    assert.throws(
      () => resolveTestAuthSupabaseUrl(true, CANONICAL_SUPABASE_URL, "sb_publishable_test_key"),
      /dedicated test project/,
    );
    assert.throws(
      () => resolveTestAuthSupabaseUrl(true, undefined, "sb_publishable_test_key"),
      /dedicated test project/,
    );
    assert.throws(
      () => resolveTestAuthSupabaseUrl(true, TEST_AUTH_SUPABASE_URL, undefined),
      /publishable key/,
    );
    assert.throws(
      () => resolveTestAuthSupabaseUrl(true, TEST_AUTH_SUPABASE_URL, "sb_secret_never"),
      /publishable key/,
    );
  });
});
