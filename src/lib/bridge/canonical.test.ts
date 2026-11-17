import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_SUPABASE_REF,
  STAGING_SUPABASE_REF,
  FORBIDDEN_SUPABASE_REFS,
  assertCanonicalSupabaseUrl,
  databaseUrlLooksForbidden,
  resolveBridgeSupabaseUrl,
} from "./canonical.ts";

describe("canonical supabase pin", () => {
  it("pins Production and explicitly identifies the approved Testing DB", () => {
    assert.equal(CANONICAL_SUPABASE_REF, "mlmgugivsyoxzdgwkbpu");
    assert.equal(STAGING_SUPABASE_REF, "jbymleftneggcgutlcqu");
    assert.ok(FORBIDDEN_SUPABASE_REFS.includes("tqzimuwozhipqgyerdff"));
    assert.throws(
      () => assertCanonicalSupabaseUrl("https://tqzimuwozhipqgyerdff.supabase.co"),
      /Forbidden/,
    );
    assert.equal(databaseUrlLooksForbidden("postgres://x@db.tqzimuwozhipqgyerdff.supabase.co/postgres"), true);
    assert.equal(databaseUrlLooksForbidden("postgres://x@db.mlmgugivsyoxzdgwkbpu.supabase.co/postgres"), false);
  });

  it("resolves Preview only to the approved Testing DB", () => {
    assert.equal(resolveBridgeSupabaseUrl({
      VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging",
      SUPABASE_URL: "https://jbymleftneggcgutlcqu.supabase.co",
    }), "https://jbymleftneggcgutlcqu.supabase.co");
    assert.throws(() => resolveBridgeSupabaseUrl({
      VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging",
      SUPABASE_URL: "https://mlmgugivsyoxzdgwkbpu.supabase.co",
    }), /approved STAGING/);
    assert.throws(() => resolveBridgeSupabaseUrl({
      VERCEL_ENV: "preview", BRIDGE_DATABASE_TARGET: "staging",
      SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
    }), /approved STAGING/);
    assert.throws(() => resolveBridgeSupabaseUrl({
      VERCEL_ENV: "preview", SUPABASE_URL: "https://jbymleftneggcgutlcqu.supabase.co",
    }), /BRIDGE_DATABASE_TARGET/);
  });

  it("keeps Production pinned to the canonical project", () => {
    assert.equal(resolveBridgeSupabaseUrl({ VERCEL_ENV: "production" }), "https://mlmgugivsyoxzdgwkbpu.supabase.co");
    assert.equal(resolveBridgeSupabaseUrl({
      VERCEL_ENV: "production", SUPABASE_URL: "https://mlmgugivsyoxzdgwkbpu.supabase.co",
    }), "https://mlmgugivsyoxzdgwkbpu.supabase.co");
    assert.throws(() => resolveBridgeSupabaseUrl({
      VERCEL_ENV: "production", SUPABASE_URL: "https://jbymleftneggcgutlcqu.supabase.co",
    }), /pinned to the canonical Production/);
  });
});
