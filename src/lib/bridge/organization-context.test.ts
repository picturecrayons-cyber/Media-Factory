import assert from "node:assert/strict";
import test from "node:test";
import {
  isStudioOrganizationContextCurrent,
  resolveStudioOrganizationContext,
} from "./organization-context.ts";
import type { StudioMembershipRecord } from "./organization-scope.ts";

const membership = (overrides: Partial<StudioMembershipRecord> = {}): StudioMembershipRecord => ({
  userId: "bridge-user-1",
  organizationId: "studio-a",
  membershipRole: "member",
  membershipStatus: "active",
  organizationStatus: "active",
  ...overrides,
});

test("explicit organization selection resolves only for the authenticated user's active membership", () => {
  const rows = [
    membership({ organizationId: "studio-a" }),
    membership({ organizationId: "studio-b", membershipRole: "admin" }),
  ];
  assert.deepEqual(resolveStudioOrganizationContext("bridge-user-1", "studio-a", rows), {
    userId: "bridge-user-1",
    selectedOrganizationId: "studio-a",
  });
  assert.deepEqual(resolveStudioOrganizationContext("bridge-user-1", "studio-b", rows), {
    userId: "bridge-user-1",
    selectedOrganizationId: "studio-b",
  });
  assert.equal(resolveStudioOrganizationContext("other-user", "studio-a", rows), null);
  assert.equal(resolveStudioOrganizationContext("bridge-user-1", "studio-secret", rows), null);
});

test("missing or blank organization selection fails closed for multi-Studio users", () => {
  const rows = [membership(), membership({ organizationId: "studio-b" })];
  assert.equal(resolveStudioOrganizationContext("bridge-user-1", null, rows), null);
  assert.equal(resolveStudioOrganizationContext("bridge-user-1", "", rows), null);
  assert.equal(resolveStudioOrganizationContext("bridge-user-1", "   ", rows), null);
});

test("suspended, removed, invited, or inactive organization cannot be selected", () => {
  const rows = [
    membership({ organizationId: "invited", membershipStatus: "invited" }),
    membership({ organizationId: "suspended", membershipStatus: "suspended" }),
    membership({ organizationId: "removed", membershipStatus: "removed" }),
    membership({ organizationId: "inactive-org", organizationStatus: "suspended" }),
  ];
  for (const id of ["invited", "suspended", "removed", "inactive-org"]) {
    assert.equal(resolveStudioOrganizationContext("bridge-user-1", id, rows), null);
  }
});

test("a previously selected context becomes invalid immediately after membership revocation or suspension", () => {
  const context = resolveStudioOrganizationContext("bridge-user-1", "studio-a", [membership()]);
  assert.ok(context);
  assert.equal(isStudioOrganizationContextCurrent(context, [membership()]), true);
  assert.equal(
    isStudioOrganizationContextCurrent(context, [membership({ membershipStatus: "suspended" })]),
    false,
  );
  assert.equal(
    isStudioOrganizationContextCurrent(context, [membership({ membershipStatus: "removed" })]),
    false,
  );
  assert.equal(
    isStudioOrganizationContextCurrent(context, [membership({ organizationStatus: "closed" })]),
    false,
  );
});
