import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_SUPABASE_REF,
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
