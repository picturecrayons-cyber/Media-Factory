import assert from "node:assert/strict";
import test from "node:test";
import { getTitleDeletionBlockReason } from "./title-deletion-policy.ts";

const emptyDraft = {
  status: "DRAFT",
  hasPosterKey: false,
  hasMasterKey: false,
  assetCount: 0,
  assetVersionCount: 0,
  ditSessionCount: 0,
};

test("an empty DRAFT title is the only deletion-eligible state", () => {
  assert.equal(getTitleDeletionBlockReason(emptyDraft), null);
});

test("UPLOADING titles are protected", () => {
  assert.match(
    getTitleDeletionBlockReason({ ...emptyDraft, status: "UPLOADING" }) ?? "",
    /Only DRAFT titles can be deleted/,
  );
});

test("PREPARING titles are protected", () => {
  assert.match(
    getTitleDeletionBlockReason({ ...emptyDraft, status: "PREPARING" }) ?? "",
    /Only DRAFT titles can be deleted/,
  );
});

test("poster and master object pointers block deletion", () => {
  assert.match(
    getTitleDeletionBlockReason({ ...emptyDraft, hasPosterKey: true }) ?? "",
    /poster or master is registered/,
  );
  assert.match(
    getTitleDeletionBlockReason({ ...emptyDraft, hasMasterKey: true }) ?? "",
    /poster or master is registered/,
  );
});

test("registered assets, asset versions, and DIT sessions block deletion", () => {
  assert.match(getTitleDeletionBlockReason({ ...emptyDraft, assetCount: 1 }) ?? "", /Registered title assets exist/);
  assert.match(getTitleDeletionBlockReason({ ...emptyDraft, assetVersionCount: 1 }) ?? "", /Asset versions exist/);
  assert.match(getTitleDeletionBlockReason({ ...emptyDraft, ditSessionCount: 1 }) ?? "", /DIT ingest session exists/);
});
