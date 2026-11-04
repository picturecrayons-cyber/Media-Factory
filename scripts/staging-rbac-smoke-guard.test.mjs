import assert from "node:assert/strict";
import test from "node:test";
import { CRA128_PHASE0_ACCEPTED, assertCra128Phase0Accepted } from "./staging-rbac-smoke-guard.mjs";

test("STAGING RBAC smoke is hard-blocked until CRA-128 Phase 0 is independently accepted", () => {
  assert.equal(CRA128_PHASE0_ACCEPTED, false);
  assert.throws(assertCra128Phase0Accepted, /CRA-128 Phase 0 is not independently accepted/);
});
