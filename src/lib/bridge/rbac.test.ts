import test from "node:test";
import assert from "node:assert/strict";
import { assertPermission, canAccessDashboard, canAccessTitleWorkspace, canReadTitle, hasPermission, workspaceHome } from "./rbac.ts";
import type { Actor } from "./rbac.ts";

const make = (userId: string, accountType: Actor["accountType"], internalRole: Actor["internalRole"] = null, emailVerified = true): Actor =>
  ({ userId, accountType, internalRole, emailVerified });
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

test("Creator and Studio have separate paid-feature and title-owner permissions", () => {
  for (const actor of [creator, studio]) {
    assert.equal(hasPermission(actor, "title.create"), true);
    assert.equal(hasPermission(actor, "title.submit_qc"), true);
    assert.equal(hasPermission(actor, "asset.sign_upload"), true);
    assert.equal(hasPermission(actor, "story_concept.create"), true);
    assert.equal(hasPermission(actor, "payment.create_story_concept_order"), true);
    assert.equal(canReadTitle(actor, { ownerUserId: actor.userId, status: "DRAFT" }), true);
    assert.equal(canReadTitle(actor, { ownerUserId: "other", status: "DRAFT" }), false);
    assert.equal(hasPermission(actor, "title.qc_review"), false);
    assert.equal(hasPermission(actor, "loop.publish"), false);
  }
  assert.equal(hasPermission(creator, "dit.upload"), false);
  assert.equal(hasPermission(creator, "payment.create_dit_agent_order"), false);
  assert.equal(hasPermission(studio, "dit.upload"), true);
  assert.equal(hasPermission(studio, "storage.manage"), true);
  assert.equal(hasPermission(studio, "payment.create_dit_agent_order"), true);
});

test("Buyer and Investor remain distinct roles with published-only Loop access", () => {
  for (const actor of [buyer, investor]) {
    assert.equal(hasPermission(actor, "buyer_loop.read"), true);
    assert.equal(hasPermission(actor, "buyer.investment_interest"), true);
    assert.equal(hasPermission(actor, "story_concept.read_buyer"), true);
    assert.equal(hasPermission(actor, "asset.read_trailer"), true);
    assert.equal(canReadTitle(actor, { ownerUserId: "creator", status: "DRAFT" }), false);
    assert.equal(canReadTitle(actor, { ownerUserId: "creator", status: "LIVE_FOR_BUYERS" }), true);
    assert.equal(hasPermission(actor, "asset.sign_download"), false);
  }
  assert.equal(hasPermission(buyer, "payment.create_order"), false);
  assert.equal(hasPermission(investor, "payment.create_order"), false);
});

test("QC Reviewer can only read the QC queue and review it", () => {
  assert.equal(hasPermission(qc, "title.qc_queue_read"), true);
  assert.equal(hasPermission(qc, "title.qc_review"), true);
  assert.equal(canReadTitle(qc, { ownerUserId: "creator", status: "QC_REVIEW" }), true);
  assert.equal(canReadTitle(qc, { ownerUserId: "creator", status: "DRAFT" }), false);
  assert.equal(hasPermission(qc, "title.read_catalog"), false);
  assert.equal(hasPermission(qc, "buyer.read"), false);
  assert.equal(hasPermission(qc, "loop.publish"), false);
});

test("Legal can only read legal queue and approve/reject legal cases", () => {
  assert.equal(hasPermission(legal, "title.legal_queue_read"), true);
  assert.equal(hasPermission(legal, "legal.contracts_read"), true);
  assert.equal(hasPermission(legal, "title.rights_review"), true);
  assert.equal(canReadTitle(legal, { ownerUserId: "creator", status: "RIGHTS_REVIEW" }), true);
  assert.equal(canReadTitle(legal, { ownerUserId: "creator", status: "DRAFT" }), false);
  assert.equal(hasPermission(legal, "finance.read"), false);
  assert.equal(hasPermission(legal, "loop.publish"), false);
});

test("Finance is read-only for revenue, Razorpay orders and payouts", () => {
  for (const p of ["finance.read","finance.payouts_read","razorpay.orders_read"] as const)
    assert.equal(hasPermission(finance, p), true);
  for (const p of ["finance.record_settlement","title.qc_review","title.update_own","loop.publish"] as const)
    assert.equal(hasPermission(finance, p), false);
  assert.equal(canReadTitle(finance, { ownerUserId: "creator", status: "DRAFT" }), false);
});

test("Admin can write business/revenue/distribution but cannot publish or see buyer data", () => {
  for (const p of ["business.write","revenue.write","distribution.write","title.admin_queue_read"] as const)
    assert.equal(hasPermission(admin, p), true);
  for (const p of ["loop.publish","loop.revoke","title.qc_review","title.rights_review","buyer.read","title.final_approve"] as const)
    assert.equal(hasPermission(admin, p), false);
});

test("Super Admin is read-only except final publish and legacy mapping", () => {
  for (const p of ["title.admin_queue_read","title.read_catalog","title.final_approve","loop.publish","legacy.map","buyer.read","buyer_loop.read","story_concept.download_approved","story_concept.final_approve","asset.read_storage_proof","asset.read_trailer"] as const)
    assert.equal(hasPermission(superAdmin, p), true);
  for (const p of ["title.create","title.update_own","asset.sign_upload","payment.create_order","title.submit_qc","business.write","revenue.write","distribution.write","loop.revoke"] as const)
    assert.equal(hasPermission(superAdmin, p), false);
  assert.equal(canAccessDashboard(superAdmin), true);
  assert.equal(canAccessDashboard(admin), false);
});

test("Viewer can see published public titles only without downloads, investment or submission", () => {
  assert.equal(hasPermission(viewer, "title.read_published"), true);
  assert.equal(canReadTitle(viewer, { ownerUserId: "creator", status: "LIVE_FOR_BUYERS" }), true);
  assert.equal(canReadTitle(viewer, { ownerUserId: "creator", status: "DRAFT" }), false);
  for (const p of ["asset.sign_download","buyer.investment_interest","title.create","title.submit_qc"] as const)
    assert.equal(hasPermission(viewer, p), false);
  assert.equal(canAccessTitleWorkspace(viewer), false);
});

test("Role destinations keep Buyer and Investor distinct but share published Loop surface", () => {
  assert.equal(workspaceHome(creator), "/creator");
  assert.equal(workspaceHome(studio), "/studio");
  assert.equal(workspaceHome(buyer), "/buyer-loop");
  assert.equal(workspaceHome(investor), "/buyer-loop");
  assert.equal(workspaceHome(superAdmin), "/dashboard");
  assert.equal(workspaceHome(viewer), "/buyer-loop");
  assert.equal(workspaceHome(qc), "/internal?desk=qc");
  assert.equal(workspaceHome(legal), "/internal?desk=legal");
  assert.equal(workspaceHome(finance), "/internal?desk=finance");
  assert.equal(workspaceHome(admin), "/internal?desk=admin");
});

test("Unverified actors fail closed", () => {
  const unverified = make("unverified", "independent_creator", null, false);
  assert.equal(hasPermission(unverified, "title.create"), false);
  assert.throws(() => assertPermission(unverified, "title.create"), /Email verification/);
});
