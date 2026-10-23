import assert from "node:assert/strict";
import test from "node:test";
import {
  BRIDGE_PREVIEW_SUPABASE_REF,
  BRIDGE_PREVIEW_SUPABASE_URL,
  BRIDGE_PRODUCTION_SUPABASE_URL,
  resolveBridgeSupabaseTarget,
} from "./supabase-target.ts";

test("Preview requires the exact staging URL and expected project ref", () => {
  assert.deepEqual(
    resolveBridgeSupabaseTarget(
      BRIDGE_PREVIEW_SUPABASE_URL,
      "preview",
      BRIDGE_PREVIEW_SUPABASE_REF,
    ),
    { url: BRIDGE_PREVIEW_SUPABASE_URL, projectRef: BRIDGE_PREVIEW_SUPABASE_REF },
  );
  assert.equal(
    resolveBridgeSupabaseTarget(
      BRIDGE_PRODUCTION_SUPABASE_URL,
      "preview",
      BRIDGE_PREVIEW_SUPABASE_REF,
    ),
    null,
  );
  assert.equal(
    resolveBridgeSupabaseTarget(BRIDGE_PREVIEW_SUPABASE_URL, "preview", undefined),
    null,
  );
});

test("Production remains pinned to the canonical production project", () => {
  assert.equal(
    resolveBridgeSupabaseTarget(
      BRIDGE_PREVIEW_SUPABASE_URL,
      "production",
      BRIDGE_PREVIEW_SUPABASE_REF,
    ),
    null,
  );
  assert.equal(
    resolveBridgeSupabaseTarget(
      BRIDGE_PRODUCTION_SUPABASE_URL,
      "production",
      BRIDGE_PREVIEW_SUPABASE_REF,
    ),
    null,
  );
  assert.deepEqual(
    resolveBridgeSupabaseTarget(
      BRIDGE_PRODUCTION_SUPABASE_URL,
      "production",
      "mlmgugivsyoxzdgwkbpu",
    ),
    { url: BRIDGE_PRODUCTION_SUPABASE_URL, projectRef: "mlmgugivsyoxzdgwkbpu" },
  );
});

test("Unknown environments fail closed", () => {
  assert.equal(resolveBridgeSupabaseTarget(BRIDGE_PRODUCTION_SUPABASE_URL, "staging"), null);
});
