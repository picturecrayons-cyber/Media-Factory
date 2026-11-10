import assert from "node:assert/strict";
import test from "node:test";
import {
  activeStudioOrganizationIds,
  hasActiveStudioMembership,
  type StudioMembershipRecord,
} from "./organization-scope.ts";

const active = (overrides: Partial<StudioMembershipRecord> = {}): StudioMembershipRecord => ({
  userId: "bridge-user-1",
  organizationId: "studio-a",
  membershipRole: "member",
  membershipStatus: "active",
  organizationStatus: "active",
  ...overrides,
});

test("one Bridge user can hold active memberships in multiple Studios", () => {
  const memberships = [
    active({ organizationId: "studio-b", membershipRole: "admin" }),
    active({ organizationId: "studio-a", membershipRole: "owner" }),
  ];
  assert.deepEqual(activeStudioOrganizationIds("bridge-user-1", memberships), ["studio-a", "studio-b"]);
});

test("membership is scoped to the exact Bridge user; another user's Studio is not inherited", () => {
  const memberships = [active({ userId: "different-user", organizationId: "studio-secret" })];
  assert.deepEqual(activeStudioOrganizationIds("bridge-user-1", memberships), []);
  assert.equal(hasActiveStudioMembership("bridge-user-1", "studio-secret", memberships), false);
});

test("invited, suspended, removed, or inactive-organization memberships grant no scope", () => {
  const memberships = [
    active({ organizationId: "invited", membershipStatus: "invited" }),
    active({ organizationId: "suspended-membership", membershipStatus: "suspended" }),
    active({ organizationId: "removed", membershipStatus: "removed" }),
    active({ organizationId: "suspended-org", organizationStatus: "suspended" }),
    active({ organizationId: "closed-org", organizationStatus: "closed" }),
  ];
  assert.deepEqual(activeStudioOrganizationIds("bridge-user-1", memberships), []);
});

test("duplicate rows cannot widen scope or produce duplicate organization IDs", () => {
  const memberships = [
    active({ organizationId: "studio-a", membershipRole: "member" }),
    active({ organizationId: "studio-a", membershipRole: "owner" }),
  ];
  assert.deepEqual(activeStudioOrganizationIds("bridge-user-1", memberships), ["studio-a"]);
});

test("missing user, blank organization, and non-member access fail closed", () => {
  const memberships = [active({ organizationId: "   " })];
  assert.deepEqual(activeStudioOrganizationIds("", memberships), []);
  assert.deepEqual(activeStudioOrganizationIds("bridge-user-1", memberships), []);
  assert.equal(hasActiveStudioMembership("bridge-user-1", "studio-a", memberships), false);
});
