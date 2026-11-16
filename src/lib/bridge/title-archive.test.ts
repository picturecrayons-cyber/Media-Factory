import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertDraftCanBeArchived } from "./title-archive.ts";

const clean = {
  status: "DRAFT", hasAssets: false, hasMaster: false, hasPoster: false,
  hasDitSession: false, hasRights: false, hasReview: false, hasCommercial: false,
};

describe("reversible draft archive eligibility", () => {
  it("allows only an untouched draft with no registered dependency", () => {
    assert.doesNotThrow(() => assertDraftCanBeArchived(clean));
  });

  it("blocks every non-draft lifecycle state", () => {
    for (const status of [
      "UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY",
      "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED",
    ]) {
      assert.throws(() => assertDraftCanBeArchived({ ...clean, status }), /Only untouched DRAFT/);
    }
  });

  it("blocks every class of linked records and media", () => {
    for (const key of [
      "hasAssets", "hasMaster", "hasPoster", "hasDitSession",
      "hasRights", "hasReview", "hasCommercial",
    ] as const) {
      assert.throws(() => assertDraftCanBeArchived({ ...clean, [key]: true }), /linked media/);
    }
  });
});
