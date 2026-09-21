import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeBlockers, rightsAreEvidenced } from "./blockers.ts";

describe("title blockers", () => {
  it("makes not-live obvious and names the gate", () => {
    const b = computeBlockers({
      status: "QC_REVIEW",
      masterKey: null,
      latestQc: null,
      rights: null,
      capturedLicense: false,
    });
    assert.ok(b.includes("Not live for buyers"));
    assert.ok(b.includes("Required asset missing"));
    assert.ok(b.includes("QC review pending"));
  });

  it("surfaces QC fail and expired rights", () => {
    const b = computeBlockers({
      status: "RIGHTS_REVIEW",
      masterKey: "k",
      latestQc: "fail",
      rights: {
        approvedAt: null,
        chainOfTitleStatus: "partial",
        endDate: "2001-01-01",
        territories: "IN",
        rightsType: "avod",
        mediaType: "film",
        evidenceNote: "doc",
      },
      capturedLicense: false,
    });
    assert.ok(b.includes("Rights review pending"));
    assert.ok(b.includes("Rights expired"));
  });

  it("rejects cosmetic rights approval without evidence", () => {
    assert.equal(
      rightsAreEvidenced({
        approvedAt: "2026-01-01",
        chainOfTitleStatus: "unverified",
        endDate: null,
        territories: "",
        rightsType: "all",
        mediaType: "film",
        evidenceNote: "",
      }),
      false,
    );
    assert.equal(
      rightsAreEvidenced({
        approvedAt: null,
        chainOfTitleStatus: "verified",
        endDate: null,
        territories: "IN",
        rightsType: "tvod",
        mediaType: "feature",
        evidenceNote: "chain of title on file",
      }),
      true,
    );
  });
});
