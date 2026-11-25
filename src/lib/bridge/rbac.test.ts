import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPermission, canAccessDashboard, canAccessTitleWorkspace, canReadTitle,
  hasPermission, workspaceHome,
} from "./rbac.ts";
import type { Actor } from "./rbac.ts";

const make = (userId: string, accountType: Actor["accountType"], internalRole: Actor["internalRole"] = null): Actor =>
  ({ userId, accountType, internalRole, emailVerified: true });
const creator = make("creator", "independent_creator");
const studio = make("studio", "studio");
const buyer = make("buyer", "buyer");
const investor = make("investor", "investor");
const qc = make("qc", "independent_creator", "qc_reviewer");
const legal = make("legal", "independent_creator", "legal_reviewer");
const finance = make("finance", "independent_creator", "finance");
const admin = make("admin", "independent_creator", "admin");
const superAdmin = make("super", "independent_creator", "super_admin");
const viewer = make("viewer", "independent_creator", "viewer");

test("Creator and Studio remain distinct owner-scoped roles", () => {
  for (const actor of [creator, studio]) {
    assert.equal(hasPermission(actor, "title.create"), true);
    assert.equal(hasPermission(actor, "title.submit_qc"), true);
    assert.equal(hasPermission(actor, "asset.sign_upload"), true);
    assert.equal(hasPermission(actor, "story_concept.create"), true);
    assert.equal(canReadTitle(actor, { ownerUserId: actor.userId, status: "DRAFT" }), true);
    assert.equal(canReadTitle(actor, { ownerUserId: "other", status: "DRAFT" }), false);
    assert.equal(hasPermission(actor, "title.qc_review"), false);
    assert.equal(hasPermission(actor, "loop.publish"), false);
  }
  assert.equal(hasPermission(creator, "dit.upload"), false);
  assert.equal(hasPermission(studio, "dit.upload"), true);
  assert.equal(hasPermission(studio, "storage.manage"), true);
});

test("Buyer and Investor are separate account types with published-only access", () => {
  assert.equal(hasPermission(buyer, "buyer_loop.read"), true);
  assert.equal(hasPermission(investor, "buyer_loop.read"), true);
  assert.equal(hasPermission(buyer, "buyer.investment_interest"), true);
  assert.equal(hasPermission(investor, "buyer.investment_interest"), true);
  assert.equal(hasPermission(buyer, "payment.create_order"), true);
  assert.equal(hasPermission(investor, "payment.create_order"), false);
  for (const actor of [buyer, investor]) {
    assert.equal(canReadTitle(actor, { ownerUserId: "creator", status: "DRAFT" }), false);
    assert.equal(canReadTitle(actor, { ownerUserId: "creator", status: "LIVE_FOR_BUYERS" }), true);
    assert.equal(hasPermission(actor, "asset.sign_download"), false);
    assert.equal(hasPermission(actor, "asset.read_trailer"), true);
  }
});

test("QC Reviewer is confined to QC queue and review actions", () => {
  assert.equal(hasPermission(qc, "title.qc_queue_read"), true);
  assert.equal(hasPermission(qc, "title.qc_review"), true);
  assert.equal(canReadTitle(qc, { ownerUserId: "creator", status: "QC_REVIEW" }), true);
  assert.equal(canReadTitle(qc, { ownerUserId: "creator", status: "DRAFT" }), false);
  assert.equal(hasPermission(qc, "title.read_catalog"), false);
  assert.equal(hasPermission(qc, "loop.publish"), false);
  assert.equal(hasPermission(qc, "buyer.read"), false);
});

test("Legal is confined to legal queue and contract review", () => {
  assert.equal(hasPermission(legal, "title.legal_queue_read"), true);
  assert.equal(hasPermission(legal, "legal.contracts_read"), true);
  assert.equal(canReadTitle(legal, { ownerUserId: "creator", status: "RIGHTS_REVIEW" }), true);
  assert.equal(canReadTitle(legal, { ownerUserId: "creator", status: "DRAFT" }), false);
  assert.equal(hasPermission(legal, "finance.read"), false);
  assert.equal(hasPermission(legal, "loop.publish"), false);
});

test("Finance sees financial data only and cannot review or publish", () => {
  assert.equal(hasPermission(finance, "finance.read"), true);
  assert.equal(hasPermission(finance, "finance.payouts_read"), true);
  assert.equal(hasPermission(finance, "razorpay.orders_read"), true);
  assert.equal(hasPermission(finance, "title.qc_review"), false);
  assert.equal(hasPermission(finance, "title.update_own"), false);
  assert.equal(hasPermission(finance, "loop.publish"), false);
  assert.equal(canReadTitle(finance, { ownerUserId: "creator", status: "DRAFT" }), false);
});

test("Admin can write workspace business/revenue/distribution but cannot publish", () => {
  for (const p of ["business.write","revenue.write","distribution.write","title.admin_queue_read"] as const)
    assert.equal(hasPermission(admin, p), true);
  assert.equal(hasPermission(admin, "loop.publish"), false);
  assert.equal(hasPermission(admin, "loop.revoke"), false);
  assert.equal(hasPermission(admin, "buyer.read"), false);
  assert.equal(hasPermission(admin, "title.final_approve"), false);
});

test("Super Admin can final-approve/publish/map but is read-only for workspace and buyer writes", () => {
  assert.equal(hasPermission(superAdmin, "title.final_approve"), true);
  assert.equal(hasPermission(superAdmin, "loop.publish"), true);
  assert.equal(hasPermission(superAdmin, "legacy.map"), true);
  assert.equal(hasPermission(superAdmin, "buyer.read"), true);
  for (const p of ["title.create","title.update_own","asset.sign_upload","payment.create_order","title.submit_qc","business.write","revenue.write","distribution.write"] as const)
    assert.equal(hasPermission(superAdmin, p), false);
  assert.equal(canAccessDashboard(superAdmin), true);
  assert.equal(canAccessDashboard(admin), false);
});

test("Viewer sees published titles only and has no downloads, investment, or submissions", () => {
  assert.equal(hasPermission(viewer, "title.read_published"), true);
  assert.equal(canReadTitle(viewer, { ownerUserId: "creator", status: "LIVE_FOR_BUYERS" }), true);
  assert.equal(canReadTitle(viewer, { ownerUserId: "creator", status: "DRAFT" }), false);
  for (const p of ["asset.sign_download","buyer.investment_interest","title.create","title.submit_qc"] as const)
    assert.equal(hasPermission(viewer, p), false);
  assert.equal(canAccessTitleWorkspace(viewer), false);
});

test("role homes remain distinct while Buyer and Investor share only the public Loop destination", () => {
  assert.equal(workspaceHome(creator), "/creator");
  assert.equal(workspaceHome(studio), "/studio");
  assert.equal(workspaceHome(buyer), "/buyer-loop");
  assert.equal(workspaceHome(investor), "/buyer-loop");
  assert.equal(workspaceHome(superAdmin), "/dashboard");
  assert.equal(workspaceHome(qc), "/internal?desk=qc");
  assert.equal(workspaceHome(legal), "/internal?desk=legal");
  assert.equal(workspaceHome(finance), "/internal?desk=finance");
  assert.equal(workspaceHome(admin), "/internal?desk=admin");
});

test("unverified actors fail closed", () => {
  const unverified = { ...creator, emailVerified: false };
  assert.equal(hasPermission(unverified, "title.create"), false);
  assert.throws(() => assertPermission(unverified, "title.create"), /Email verification/);
});
