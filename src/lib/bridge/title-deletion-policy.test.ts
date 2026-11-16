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

test("even an empty DRAFT remains protected while deletion is disabled", () => {
  assert.match(getTitleDeletionBlockReason(emptyDraft), /deletion is disabled/);
});

test("UPLOADING, PREPARING, and media-bearing titles remain protected", () => {
  for (const state of [
    { ...emptyDraft, status: "UPLOADING" },
    { ...emptyDraft, status: "PREPARING" },
    { ...emptyDraft, hasPosterKey: true },
    { ...emptyDraft, hasMasterKey: true },
    { ...emptyDraft, assetCount: 1 },
    { ...emptyDraft, assetVersionCount: 1 },
    { ...emptyDraft, ditSessionCount: 1 },
  ]) {
    assert.match(getTitleDeletionBlockReason(state), /deletion is disabled/);
  }
});
