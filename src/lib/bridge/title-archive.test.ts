import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertDraftCanBeArchived } from "./title-archive.ts";

const clean = {
  status: "DRAFT", hasAssets: false, hasMaster: false, hasPoster: false,
  hasDitSession: false, hasRights: false, hasReview: false, hasCommercial: false,
};

describe("reversible draft archive eligibility", () => {
  it("allows an untouched draft", () => {
    assert.doesNotThrow(() => assertDraftCanBeArchived(clean));
  });

  it("blocks non-draft lifecycle states", () => {
    for (const status of [
      "UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW",
      "LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION",
      "LICENSED", "DELIVERED",
    ]) {
      assert.throws(() => assertDraftCanBeArchived({ ...clean, status }), /Only DRAFT/);
    }
  });

  it("blocks linked media, ingest, review, rights and commercial records", () => {
    for (const key of [
      "hasAssets", "hasMaster", "hasPoster", "hasDitSession",
      "hasRights", "hasReview", "hasCommercial",
    ] as const) {
      assert.throws(() => assertDraftCanBeArchived({ ...clean, [key]: true }), /linked media/);
    }
  });
});
