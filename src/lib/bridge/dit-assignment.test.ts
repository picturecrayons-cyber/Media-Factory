import assert from "node:assert/strict";
import test from "node:test";
import { hasActiveDitAssignment, type DitAssignment } from "./dit-assignment.ts";

const assignment = (overrides: Partial<DitAssignment> = {}): DitAssignment => ({
  assignedUserId: "dit-user-a",
  productionId: "production-a",
  titleId: "title-a",
  assetId: "asset-master-a",
  status: "active",
  ...overrides,
});

test("DIT access requires an exact active user, production, title and asset assignment", () => {
  assert.equal(hasActiveDitAssignment("dit-user-a", "production-a", "title-a", "asset-master-a", [assignment()]), true);
  assert.equal(hasActiveDitAssignment("dit-user-a", "production-a", "title-a", null, [assignment({ assetId: null })]), true);
});

test("DIT assignment cannot be inherited by another user, production, title or asset", () => {
  const assignments = [assignment()];
  assert.equal(hasActiveDitAssignment("dit-user-b", "production-a", "title-a", "asset-master-a", assignments), false);
  assert.equal(hasActiveDitAssignment("dit-user-a", "production-b", "title-a", "asset-master-a", assignments), false);
  assert.equal(hasActiveDitAssignment("dit-user-a", "production-a", "title-b", "asset-master-a", assignments), false);
  assert.equal(hasActiveDitAssignment("dit-user-a", "production-a", "title-a", "asset-proxy-a", assignments), false);
});

test("asset-scoped assignment cannot authorize a broader production/title-level request", () => {
  assert.equal(
    hasActiveDitAssignment("dit-user-a", "production-a", "title-a", null, [
      assignment({ assetId: "asset-master-a" }),
    ]),
    false,
  );
});

test("pending, suspended and revoked assignments fail closed", () => {
  for (const status of ["pending", "suspended", "revoked"] as const) {
    assert.equal(hasActiveDitAssignment("dit-user-a", "production-a", "title-a", "asset-master-a", [assignment({ status })]), false);
  }
});

test("missing identity or scope fails closed", () => {
  assert.equal(hasActiveDitAssignment("", "production-a", "title-a", "asset-master-a", [assignment()]), false);
  assert.equal(hasActiveDitAssignment("dit-user-a", "", "title-a", "asset-master-a", [assignment()]), false);
  assert.equal(hasActiveDitAssignment("dit-user-a", "production-a", "", "asset-master-a", [assignment()]), false);
});
