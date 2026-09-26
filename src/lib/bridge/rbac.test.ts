import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertPermission,
  canReadTitle,
  hasPermission,
  permissionForTransition,
  workspaceHome,
} from "./rbac.ts";
import type { Actor } from "./rbac.ts";

const creator = (verified = true): Actor => ({
  userId: "u1",
  emailVerified: verified,
  accountType: "independent_creator",
  internalRole: null,
});

const buyer = (verified = true): Actor => ({
  userId: "b1",
  emailVerified: verified,
  accountType: "buyer",
  internalRole: null,
});

const qc: Actor = {
  userId: "qc1",
  emailVerified: true,
  accountType: "independent_creator",
  internalRole: "qc_reviewer",
};

describe("rbac", () => {
  it("blocks every permission until email is verified", () => {
    assert.equal(hasPermission(creator(false), "title.create"), false);
    assert.throws(() => assertPermission(creator(false), "title.create"), /Email verification/);
  });

  it("lets creators create and advance upload, not QC or license", () => {
    assert.equal(hasPermission(creator(), "title.create"), true);
    assert.equal(hasPermission(creator(), "title.advance_upload"), true);
    assert.equal(hasPermission(creator(), "title.qc_review"), false);
    assert.equal(hasPermission(creator(), "title.license"), false);
    assert.equal(hasPermission(creator(), "payment.create_order"), false);
  });

  it("lets buyers read live catalog and pay, not create titles", () => {
    assert.equal(hasPermission(buyer(), "title.create"), false);
    assert.equal(hasPermission(buyer(), "title.read_catalog"), true);
    assert.equal(hasPermission(buyer(), "payment.create_order"), true);
    assert.equal(
      canReadTitle(buyer(), { ownerUserId: "u1", status: "DRAFT" }),
      false,
    );
    assert.equal(
      canReadTitle(buyer(), { ownerUserId: "u1", status: "LIVE_FOR_BUYERS" }),
      true,
    );
  });

  it("maps lifecycle steps to permissions and withholds LICENSED", () => {
    assert.equal(permissionForTransition("DRAFT", "UPLOADING"), "title.advance_upload");
    assert.equal(permissionForTransition("QC_REVIEW", "RIGHTS_REVIEW"), "title.qc_review");
    assert.equal(permissionForTransition("IN_NEGOTIATION", "LICENSED"), null);
    assert.equal(hasPermission(qc, "title.qc_review"), true);
  });

  it("routes every authenticated role into the unified workspace", () => {
    assert.equal(workspaceHome(creator()), "/workspace");
    assert.equal(workspaceHome(buyer()), "/workspace");
    assert.equal(workspaceHome(qc), "/workspace");
  });
});
