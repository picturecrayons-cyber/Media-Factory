import test from "node:test";
import assert from "node:assert/strict";
import { canAccessAdminWorkstations, type Actor } from "./rbac.ts";

function actor(internalRole: Actor["internalRole"], emailVerified = true): Actor {
  return { userId: "test-user", emailVerified, accountType: "independent_creator", internalRole };
}

test("only verified admin and super_admin roles can access broad Admin Workstations data", () => {
  assert.equal(canAccessAdminWorkstations(actor("admin")), true);
  assert.equal(canAccessAdminWorkstations(actor("super_admin")), true);
  assert.equal(canAccessAdminWorkstations(actor("viewer")), false);
  assert.equal(canAccessAdminWorkstations(actor("qc_reviewer")), false);
  assert.equal(canAccessAdminWorkstations(actor("legal_reviewer")), false);
  assert.equal(canAccessAdminWorkstations(actor("finance")), false);
  assert.equal(canAccessAdminWorkstations(actor(null)), false);
});

test("unverified admin identities cannot access Admin Workstations", () => {
  assert.equal(canAccessAdminWorkstations(actor("admin", false)), false);
  assert.equal(canAccessAdminWorkstations(actor("super_admin", false)), false);
});
