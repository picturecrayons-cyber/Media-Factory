import test from "node:test";
import assert from "node:assert/strict";
import type { Actor } from "./rbac.ts";
import {
  canOperateVendorJob,
  canRequestVendorJob,
  canSignOffVendorJob,
  nextVendorJobState,
} from "./vendor-delivery-policy.ts";

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";
const actor = (overrides: Partial<Actor> = {}): Actor => ({
  userId: "studio-a", emailVerified: true, accountType: "studio",
  internalRole: null, organizationId: orgA, ...overrides,
});

test("studio requests are limited to owned titles or active same-organization scope", () => {
  assert.equal(canRequestVendorJob(actor(), {
    ownerUserId: "studio-a", ownerAccountType: "studio", ownerOrganizationId: orgA,
  }), true);
  assert.equal(canRequestVendorJob(actor(), {
    ownerUserId: "studio-b", ownerAccountType: "studio", ownerOrganizationId: orgB,
  }), false);
  assert.equal(canRequestVendorJob(actor({ organizationId: null }), {
    ownerUserId: "studio-b", ownerAccountType: "studio", ownerOrganizationId: orgA,
  }), false);
});

test("buyers, unverified users and read-only staff cannot request vendor work", () => {
  assert.equal(canRequestVendorJob(actor({ accountType: "buyer" }), {
    ownerUserId: "studio-a", ownerAccountType: "studio", ownerOrganizationId: orgA,
  }), false);
  assert.equal(canRequestVendorJob(actor({ emailVerified: false }), {
    ownerUserId: "studio-a", ownerAccountType: "studio", ownerOrganizationId: orgA,
  }), false);
  assert.equal(canRequestVendorJob(actor({
    internalRole: "viewer", accountType: "independent_creator", organizationId: orgA,
  }), {
    ownerUserId: "someone-else", ownerAccountType: "studio", ownerOrganizationId: orgA,
  }), false);
});

test("internal operations require explicit delivery permission and matching organization", () => {
  const admin: Actor = actor({ internalRole: "admin", accountType: "independent_creator" });
  assert.equal(canOperateVendorJob(admin, orgA), true);
  assert.equal(canOperateVendorJob(admin, orgB), false);
  assert.equal(canOperateVendorJob(actor({ internalRole: "admin", organizationId: null }), orgA), false);
  assert.equal(canOperateVendorJob(actor({ internalRole: "qc_reviewer" }), orgA), false);
  assert.equal(canOperateVendorJob(actor({ internalRole: "super_admin" }), orgB), false);
});

test("vendor job transitions are explicit and fail closed", () => {
  assert.equal(nextVendorJobState("requested", "start_work"), null);
  assert.equal(nextVendorJobState("assigned", "start_work"), "in_progress");
  assert.equal(nextVendorJobState("in_progress", "submit_review"), "in_review");
  assert.equal(nextVendorJobState("in_review", "sign_off"), "signed_off");
  assert.equal(nextVendorJobState("signed_off", "block"), null);
});

test("requester cannot approve their own vendor job", () => {
  assert.equal(canSignOffVendorJob("requester", "reviewer"), true);
  assert.equal(canSignOffVendorJob("requester", "requester"), false);
  assert.equal(canSignOffVendorJob("", "reviewer"), false);
});
