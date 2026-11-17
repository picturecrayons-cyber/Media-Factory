import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_SUPABASE_REF,
  STAGING_SUPABASE_REF,
  STAGING_SUPABASE_URL,
  resolveBridgeSupabaseUrl,
  FORBIDDEN_SUPABASE_REFS,
  assertCanonicalSupabaseUrl,
  databaseUrlLooksForbidden,
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


describe("browser Supabase environment isolation", () => {
  const stagingUrl = `https://${STAGING_SUPABASE_REF}.supabase.co`;
  const productionUrl = `https://${CANONICAL_SUPABASE_REF}.supabase.co`;

  it("accepts only the approved Testing DB for Preview", () => {
    assert.equal(
      resolveBridgeSupabaseUrl({
        VERCEL_ENV: "preview",
        BRIDGE_DATABASE_TARGET: "staging",
        SUPABASE_URL: stagingUrl,
      }),
      STAGING_SUPABASE_URL,
    );
  });

  it("fails closed when Preview target is missing or not staging", () => {
    assert.throws(
      () => resolveBridgeSupabaseUrl({ VERCEL_ENV: "preview", SUPABASE_URL: stagingUrl }),
      /must explicitly equal staging/,
    );
    assert.throws(
      () => resolveBridgeSupabaseUrl({
        VERCEL_ENV: "preview",
        BRIDGE_DATABASE_TARGET: "production",
        SUPABASE_URL: stagingUrl,
      }),
      /must explicitly equal staging/,
    );
  });

  it("rejects Production and unknown projects from Preview", () => {
    assert.throws(
      () => resolveBridgeSupabaseUrl({
        VERCEL_ENV: "preview",
        BRIDGE_DATABASE_TARGET: "staging",
        SUPABASE_URL: productionUrl,
      }),
      /approved STAGING Supabase project/,
    );
    assert.throws(
      () => resolveBridgeSupabaseUrl({
        VERCEL_ENV: "preview",
        BRIDGE_DATABASE_TARGET: "staging",
        SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
      }),
      /approved STAGING Supabase project/,
    );
  });

  it("pins Production to the canonical Production project", () => {
    assert.equal(
      resolveBridgeSupabaseUrl({ VERCEL_ENV: "production", SUPABASE_URL: productionUrl }),
      productionUrl,
    );
    assert.throws(
      () => resolveBridgeSupabaseUrl({ VERCEL_ENV: "production", SUPABASE_URL: stagingUrl }),
      /pinned to the canonical Production/,
    );
  });

  it("uses the canonical project for local development unless explicitly configured", () => {
    assert.equal(resolveBridgeSupabaseUrl({ VERCEL_ENV: "development" }), productionUrl);
  });
});
