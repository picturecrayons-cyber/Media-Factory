import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertArchiveReason,
  assertDraftCanBeArchived,
  assertRestoreCanProceed,
  type TitleArchiveDependencyFlags,
} from "./title-archive-policy.ts";

const clean: TitleArchiveDependencyFlags = {
  hasAssets: false, hasAssetVersions: false, hasProductionAssets: false,
  hasIngestSessions: false, hasQcRecords: false, hasLegalRecords: false,
  hasRightsRecords: false, hasAuthorizationRecords: false, hasLoopPublications: false,
  hasLoopTitles: false, hasPayments: false, hasEntitlements: false,
  hasDeliveryRecords: false, hasSubmissionRecords: false, hasDocumentRecords: false,
  hasBuyerRecords: false, hasFinanceRecords: false, hasOtherLinkedRecords: false,
};

describe("reversible title archive policy", () => {
  it("allows an eligible clean DRAFT", () => {
    assert.doesNotThrow(() => assertDraftCanBeArchived({
      status: "DRAFT", archivedAt: null, hasMaster: false, hasPoster: false, dependencies: clean,
    }));
  });
  it("rejects every non-DRAFT status and archived rows", () => {
    assert.throws(() => assertDraftCanBeArchived({
      status: "PREPARING", hasMaster: false, hasPoster: false, dependencies: clean,
    }), /Only DRAFT/);
    assert.throws(() => assertDraftCanBeArchived({
      status: "DRAFT", archivedAt: "2026-11-22T00:00:00Z", hasMaster: false, hasPoster: false, dependencies: clean,
    }), /already archived/);
  });
  it("blocks each protected dependency", () => {
    for (const key of Object.keys(clean) as (keyof TitleArchiveDependencyFlags)[]) {
      assert.throws(() => assertDraftCanBeArchived({
        status: "DRAFT", hasMaster: false, hasPoster: false, dependencies: { ...clean, [key]: true },
      }), /protected linked records/);
    }
  });
  it("requires reason", () => {
    assert.throws(() => assertArchiveReason("  "), /reason/);
    assert.throws(() => assertArchiveReason("x"), /reason/);
    assert.equal(assertArchiveReason("  Duplicate test draft  "), "Duplicate test draft");
  });
  it("revalidates restore eligibility and dependencies", () => {
    assert.doesNotThrow(() => assertRestoreCanProceed({
      status: "DRAFT", archivedAt: "2026-11-22T00:00:00Z", hasNewProtectedDependency: false,
    }));
    assert.throws(() => assertRestoreCanProceed({
      status: "DRAFT", archivedAt: null, hasNewProtectedDependency: false,
    }), /Only archived/);
    assert.throws(() => assertRestoreCanProceed({
      status: "DRAFT", archivedAt: "2026-11-22T00:00:00Z", hasNewProtectedDependency: true,
    }), /protected linked records/);
  });
});
