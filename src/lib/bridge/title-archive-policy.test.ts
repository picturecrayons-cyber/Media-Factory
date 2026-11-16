import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertDraftCanBeArchived } from "./title-archive-policy.ts";

const clean = {
  status: "DRAFT",
  hasAssets: false,
  hasMaster: false,
  hasPoster: false,
  hasActiveDitSession: false,
  hasRightsRecords: false,
  hasQcRecords: false,
  hasLegalRecords: false,
  hasFinancialOrCommercialRecords: false,
};

describe("reversible draft archive policy", () => {
  it("permits only a clean DRAFT with no dependent records", () => {
    assert.doesNotThrow(() => assertDraftCanBeArchived(clean));
  });

  it("rejects processing, review, commercial, licensed and delivered states", () => {
    for (const status of [
      "UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW",
      "LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION",
      "LICENSED", "DELIVERED",
    ]) {
      assert.throws(() => assertDraftCanBeArchived({ ...clean, status }), /Only untouched DRAFT/);
    }
  });

  it("rejects every type of linked asset, ingest, review, rights or commercial dependency", () => {
    const dependencyKeys = [
      "hasAssets", "hasMaster", "hasPoster", "hasActiveDitSession",
      "hasRightsRecords", "hasQcRecords", "hasLegalRecords",
      "hasFinancialOrCommercialRecords",
    ] as const;
    for (const key of dependencyKeys) {
      assert.throws(() => assertDraftCanBeArchived({ ...clean, [key]: true }), /linked assets/);
    }
  });
});
