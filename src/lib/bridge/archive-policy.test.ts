import assert from "node:assert/strict";
import test from "node:test";
import { evaluateTitleArchive, evaluateTitleRestore, type ArchiveDependencySnapshot } from "./archive-policy.ts";

const noDependencies: ArchiveDependencySnapshot = {
  buyerVisible: false,
  negotiationOpen: false,
  licenseActive: false,
  deliveryActive: false,
  entitlementActive: false,
  loopPublicationActive: false,
  financialObligationOpen: false,
  rightsGrantActive: false,
};

test("only an identity-confirmed draft with no downstream dependencies can be archived", () => {
  assert.deepEqual(
    evaluateTitleArchive({ status: "DRAFT", titleName: "Draft Film", confirmedTitleName: "Draft Film", dependencies: noDependencies }),
    { eligible: true, reasons: [] },
  );
});

test("archive fails closed for protected lifecycle states and mismatched title confirmation", () => {
  const decision = evaluateTitleArchive({
    status: "LIVE_FOR_BUYERS",
    titleName: "Live Film",
    confirmedTitleName: "Other Film",
    dependencies: noDependencies,
  });
  assert.equal(decision.eligible, false);
  if (!decision.eligible) {
    assert.ok(decision.reasons.includes("Only DRAFT titles are eligible for archive"));
    assert.ok(decision.reasons.includes("Title identity confirmation does not match"));
  }
});

test("every downstream dependency independently blocks archive", () => {
  for (const key of Object.keys(noDependencies) as Array<keyof ArchiveDependencySnapshot>) {
    const decision = evaluateTitleArchive({
      status: "DRAFT",
      titleName: "Draft Film",
      confirmedTitleName: "Draft Film",
      dependencies: { ...noDependencies, [key]: true },
    });
    assert.equal(decision.eligible, false, key);
  }
});

test("restore requires durable archive attribution, stable identity and no slug conflict", () => {
  assert.deepEqual(
    evaluateTitleRestore({
      archivedAt: "2026-11-08T10:00:00.000Z",
      archivedBy: "staff-1",
      slugConflict: false,
      titleIdentityAvailable: true,
    }),
    { eligible: true, reasons: [] },
  );
  assert.equal(
    evaluateTitleRestore({
      archivedAt: null,
      archivedBy: null,
      slugConflict: true,
      titleIdentityAvailable: false,
    }).eligible,
    false,
  );
});
