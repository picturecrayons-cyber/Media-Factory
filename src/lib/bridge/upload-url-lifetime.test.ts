import test from "node:test";
import assert from "node:assert/strict";
import { uploadUrlLifetimeSeconds } from "./upload-url-lifetime.ts";

test("small uploads keep a 15-minute write link", () => {
  assert.equal(uploadUrlLifetimeSeconds(undefined), 900);
  assert.equal(uploadUrlLifetimeSeconds(170 * 1024 * 1024), 900);
});

test("a film master write link covers a slow single PUT and stays capped", () => {
  const fortyGigabytes = Math.round(39675.6 * 1024 * 1024);
  const lifetime = uploadUrlLifetimeSeconds(fortyGigabytes);
  assert.ok(lifetime > 3 * 3600);
  assert.ok(lifetime <= 12 * 3600);
});
