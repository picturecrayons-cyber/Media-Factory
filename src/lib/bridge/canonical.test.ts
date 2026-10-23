import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_SUPABASE_REF,
  STAGING_SUPABASE_REF,
  FORBIDDEN_SUPABASE_REFS,
  assertCanonicalSupabaseUrl,
  resolveConfiguredSupabaseUrl,
  databaseUrlLooksForbidden,
  assertDatabaseUrlIsolated,
} from "./canonical.ts";

describe("canonical Supabase target selection", () => {
  it("pins the owner-approved Production project", () => {
    assert.equal(CANONICAL_SUPABASE_REF, "mlmgugivsyoxzdgwkbpu");
    assert.equal(
      assertCanonicalSupabaseUrl("https://mlmgugivsyoxzdgwkbpu.supabase.co"),
      "https://mlmgugivsyoxzdgwkbpu.supabase.co",
    );
  });

  it("allows the staging project only when Preview and expected ref both agree", () => {
    assert.equal(STAGING_SUPABASE_REF, "bbtrosuwisnxacuxvegt");
    assert.equal(
      resolveConfiguredSupabaseUrl(
        "https://bbtrosuwisnxacuxvegt.supabase.co",
        "preview",
        "bbtrosuwisnxacuxvegt",
      ),
      "https://bbtrosuwisnxacuxvegt.supabase.co",
    );
  });

  it("fails closed for staging URL outside Preview or without explicit expected ref", () => {
    assert.throws(
      () =>
        resolveConfiguredSupabaseUrl(
          "https://bbtrosuwisnxacuxvegt.supabase.co",
          "production",
          "bbtrosuwisnxacuxvegt",
        ),
      /canonical/,
    );
    assert.throws(
      () =>
        resolveConfiguredSupabaseUrl(
          "https://bbtrosuwisnxacuxvegt.supabase.co",
          "preview",
          undefined,
        ),
      /approved staging/,
    );
    assert.throws(
      () =>
        resolveConfiguredSupabaseUrl(
          "https://mlmgugivsyoxzdgwkbpu.supabase.co",
          "preview",
          "mlmgugivsyoxzdgwkbpu",
        ),
      /approved staging/,
    );
  });

  it("rejects forbidden legacy refs and non-HTTPS/non-Supabase URLs", () => {
    assert.ok(FORBIDDEN_SUPABASE_REFS.includes("tqzimuwozhipqgyerdff"));
    assert.throws(
      () => assertCanonicalSupabaseUrl("https://tqzimuwozhipqgyerdff.supabase.co"),
      /Forbidden/,
    );
    assert.equal(
      databaseUrlLooksForbidden("postgres://x@db.tqzimuwozhipqgyerdff.supabase.co/postgres"),
      true,
    );
    assert.equal(
      databaseUrlLooksForbidden("postgres://x@db.mlmgugivsyoxzdgwkbpu.supabase.co/postgres"),
      false,
    );
    assert.throws(
      () => resolveConfiguredSupabaseUrl("http://mlmgugivsyoxzdgwkbpu.supabase.co", "production", undefined),
      /Invalid/,
    );
    assert.throws(
      () => resolveConfiguredSupabaseUrl("https://example.com", "production", undefined),
      /Invalid/,
    );
  });

  it("enforces database URL environment isolation", () => {
    assert.doesNotThrow(() =>
      assertDatabaseUrlIsolated(
        "postgres://x@db.bbtrosuwisnxacuxvegt.supabase.co/postgres",
        "preview",
      ),
    );
    assert.throws(
      () =>
        assertDatabaseUrlIsolated(
          "postgres://x@db.mlmgugivsyoxzdgwkbpu.supabase.co/postgres",
          "preview",
        ),
      /Preview environment must not target production database/,
    );
    assert.throws(
      () =>
        assertDatabaseUrlIsolated(
          "postgres://x@db.tqzimuwozhipqgyerdff.supabase.co/postgres",
          "production",
        ),
      /Forbidden Supabase project ref/,
    );
  });
});
