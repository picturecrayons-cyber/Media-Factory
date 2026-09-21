import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_SUPABASE_REF,
  FORBIDDEN_SUPABASE_REFS,
  assertCanonicalSupabaseUrl,
  assertAllowedDatabaseUrl,
  databaseUrlLooksForbidden,
  withRequiredSsl,
} from "./canonical.ts";

describe("canonical supabase pin", () => {
  it("pins the owner-approved project and rejects forbidden refs", () => {
    assert.equal(CANONICAL_SUPABASE_REF, "uakpqqardziifcwzvgfx");
    assert.ok(FORBIDDEN_SUPABASE_REFS.includes("tqzimuwozhipqgyerdff"));
    assert.ok(FORBIDDEN_SUPABASE_REFS.includes("jpfyhahrdxbtwximsglj"));
    assert.throws(
      () => assertCanonicalSupabaseUrl("https://tqzimuwozhipqgyerdff.supabase.co"),
      /Forbidden/,
    );
    assert.equal(databaseUrlLooksForbidden("postgres://x@db.tqzimuwozhipqgyerdff.supabase.co/postgres"), true);
    assert.equal(databaseUrlLooksForbidden("postgres://x@db.jpfyhahrdxbtwximsglj.supabase.co/postgres"), true);
    assert.equal(databaseUrlLooksForbidden("postgres://x@db.uakpqqardziifcwzvgfx.supabase.co/postgres"), false);
  });

  it("allows the canonical pooler URI and rejects other supabase hosts", () => {
    assert.doesNotThrow(() =>
      assertAllowedDatabaseUrl(
        "postgresql://postgres.uakpqqardziifcwzvgfx:x@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
      ),
    );
    assert.throws(
      () =>
        assertAllowedDatabaseUrl(
          "postgresql://postgres.jpfyhahrdxbtwximsglj:x@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
        ),
      /Forbidden/,
    );
  });

  it("adds sslmode=require without altering an existing sslmode", () => {
    assert.equal(withRequiredSsl("postgres://x@h/db"), "postgres://x@h/db?sslmode=require");
    assert.equal(withRequiredSsl("postgres://x@h/db?sslmode=require"), "postgres://x@h/db?sslmode=require");
  });
});
