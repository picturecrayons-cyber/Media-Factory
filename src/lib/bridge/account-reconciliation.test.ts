import test from "node:test";
import assert from "node:assert/strict";
import { reconcileAccountIdentities } from "./account-reconciliation.ts";

test("preserves existing Super Admin and Studio profiles through direct identity matches", () => {
  const profiles = [
    { bridgeUserId: "super-admin-id", email: "picturecrayons@gmail.com", accountType: "independent_creator", internalRole: "super_admin" },
    { bridgeUserId: "studio-owner-id", email: "abijithasokan@crayonspictures.com", accountType: "studio", internalRole: null },
  ];
  const result = reconcileAccountIdentities({
    authIdentities: [
      { authUserId: "super-admin-id", email: "picturecrayons@gmail.com", emailVerified: true },
      { authUserId: "studio-owner-id", email: "abijithasokan@crayonspictures.com", emailVerified: true },
    ],
    bridgeProfiles: profiles,
    identityLinks: [],
  });
  assert.deepEqual(result.map((item) => item.status), ["direct_profile_match", "direct_profile_match"]);
  assert.equal(profiles[0].internalRole, "super_admin");
  assert.equal(profiles[1].accountType, "studio");
});

test("uses an explicit identity link for cross-ID reconciliation", () => {
  const result = reconcileAccountIdentities({
    authIdentities: [{ authUserId: "auth-new-id", email: "creator@example.test", emailVerified: true }],
    bridgeProfiles: [{ bridgeUserId: "bridge-existing-id", email: "creator@example.test", accountType: "independent_creator", internalRole: null }],
    identityLinks: [{ authUserId: "auth-new-id", bridgeUserId: "bridge-existing-id" }],
  });
  assert.equal(result[0].status, "explicit_identity_link");
  assert.equal(result[0].bridgeUserId, "bridge-existing-id");
});

test("does not adopt an existing profile from email equality alone", () => {
  const result = reconcileAccountIdentities({
    authIdentities: [{ authUserId: "new-auth-id", email: "studio@example.test", emailVerified: true }],
    bridgeProfiles: [{ bridgeUserId: "existing-studio-id", email: "studio@example.test", accountType: "studio", internalRole: null }],
    identityLinks: [],
  });
  assert.equal(result[0].status, "manual_review_email_match");
  assert.equal(result[0].bridgeUserId, null);
});

test("does not grant roles from signup metadata or create duplicate profiles", () => {
  const result = reconcileAccountIdentities({
    authIdentities: [{ authUserId: "new-user-id", email: "new@example.test", emailVerified: true }],
    bridgeProfiles: [],
    identityLinks: [],
  });
  assert.equal(result[0].status, "onboarding_required");
  assert.equal(result[0].bridgeUserId, null);
});

test("flags conflicting identity links for manual review", () => {
  const result = reconcileAccountIdentities({
    authIdentities: [{ authUserId: "auth-id", email: "person@example.test", emailVerified: true }],
    bridgeProfiles: [
      { bridgeUserId: "bridge-a", email: "a@example.test", accountType: "studio", internalRole: null },
      { bridgeUserId: "bridge-b", email: "b@example.test", accountType: "buyer", internalRole: null },
    ],
    identityLinks: [
      { authUserId: "auth-id", bridgeUserId: "bridge-a" },
      { authUserId: "auth-id", bridgeUserId: "bridge-b" },
    ],
  });
  assert.equal(result[0].status, "manual_review_conflicting_links");
});


test("dashboard certification routes each existing public account type to its workspace", async () => {
  const { workspaceHome, canAccessDashboard } = await import("./rbac.ts");
  const base = { userId: "user", emailVerified: true, organizationId: null };
  assert.equal(workspaceHome({ ...base, accountType: "independent_creator", internalRole: null }), "/creator");
  assert.equal(workspaceHome({ ...base, accountType: "studio", internalRole: null }), "/studio");
  assert.equal(workspaceHome({ ...base, accountType: "buyer", internalRole: null }), "/buyer");
  assert.equal(workspaceHome({ ...base, accountType: "independent_creator", internalRole: "super_admin" }), "/dashboard");
  assert.equal(canAccessDashboard({ ...base, accountType: "independent_creator", internalRole: "super_admin" }), true);
  assert.equal(canAccessDashboard({ ...base, accountType: "studio", internalRole: null }), false);
  assert.equal(canAccessDashboard({ ...base, accountType: "independent_creator", internalRole: "admin" }), false);
});
