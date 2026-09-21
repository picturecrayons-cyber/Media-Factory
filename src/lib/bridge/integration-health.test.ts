import assert from "node:assert/strict";
import test from "node:test";
import { integrationLabel } from "./integration-health.ts";

test("env-only is configured, never connected", () => {
  assert.equal(integrationLabel({ bound: true }), "configured");
  assert.equal(integrationLabel({ bound: true, probedOk: null }), "configured");
  assert.equal(integrationLabel({ bound: true, probedOk: true }), "connected");
  assert.equal(integrationLabel({ bound: false }), "not_configured");
  assert.equal(integrationLabel({ bound: true, probedOk: false }), "error");
});
