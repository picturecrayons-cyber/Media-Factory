import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoExclusiveOverlap,
  deriveSupplyGates,
  exclusiveConflict,
  type RightsWindow,
} from "./supply-readiness.ts";

const grant = (overrides: Partial<RightsWindow> = {}): RightsWindow => ({
  status: "VALID",
  exclusivity: "NON_EXCLUSIVE",
  territories: ["IN"],
  languages: ["ml"],
  media: ["SVOD"],
  windowStart: "2026-01-01T00:00:00.000Z",
  windowEnd: "2026-12-31T00:00:00.000Z",
  ...overrides,
});

describe("exclusive rights", () => {
  it("rejects overlapping exclusive authorization", () => {
    const conflict = exclusiveConflict([
      grant({ exclusivity: "EXCLUSIVE" }),
      grant({ exclusivity: "NON_EXCLUSIVE", media: ["SVOD"] }),
    ]);
    assert.equal(conflict, "Overlapping exclusive authorization");
    assert.throws(
      () => assertNoExclusiveOverlap([grant({ exclusivity: "EXCLUSIVE" })], grant()),
      /Overlapping exclusive/,
    );
  });

  it("allows separated windows and ignores revoked grants", () => {
    assert.equal(
      exclusiveConflict([
        grant({ exclusivity: "EXCLUSIVE", windowEnd: "2026-06-01T00:00:00.000Z" }),
        grant({ exclusivity: "EXCLUSIVE", windowStart: "2026-06-01T00:00:00.000Z" }),
        grant({ exclusivity: "EXCLUSIVE", status: "REVOKED" }),
      ]),
      null,
    );
  });
});

describe("supply gates", () => {
  const now = new Date("2026-09-28T00:00:00.000Z");

  it("does not treat a master key or licensing lifecycle as QC or legal", () => {
    const gates = deriveSupplyGates({
      recordsAvailable: true,
      verifiedAssetCount: 2,
      qcStatus: null,
      legalStatus: null,
      rights: [],
      packageState: null,
      now,
    });
    assert.equal(gates.INGEST.state, "PASS");
    assert.equal(gates.QC.state, "UNAVAILABLE");
    assert.equal(gates.LEGAL.state, "UNAVAILABLE");
    assert.equal(gates.RIGHTS.state, "UNAVAILABLE");
    assert.equal(gates.AUTHORIZED.state, "UNAVAILABLE");
    assert.match(gates.LEGAL.detail, /QC does not clear legal/);
  });

  it("passes only when QC, legal and rights are separate recorded passes", () => {
    const gates = deriveSupplyGates({
      recordsAvailable: true,
      verifiedAssetCount: 1,
      qcStatus: "PASSED",
      legalStatus: "APPROVED",
      rights: [grant()],
      packageState: "AUTHORIZED",
      now,
    });
    assert.equal(gates.QC.state, "PASS");
    assert.equal(gates.LEGAL.state, "PASS");
    assert.equal(gates.RIGHTS.state, "PASS");
    assert.equal(gates.PACKAGE.state, "PASS");
    assert.equal(gates.AUTHORIZED.state, "PASS");
  });

  it("does not authorize a title with a revoked or held destination", () => {
    const input = { recordsAvailable: true, verifiedAssetCount: 1, qcStatus: "PASSED", legalStatus: "APPROVED", rights: [grant()], now };
    assert.equal(deriveSupplyGates({ ...input, packageStates: ["AUTHORIZED", "REVOKED"] }).AUTHORIZED.state, "FAILED");
    assert.equal(deriveSupplyGates({ ...input, packageStates: ["AUTHORIZED", "HOLD"] }).AUTHORIZED.state, "UNAVAILABLE");
    assert.equal(deriveSupplyGates({ ...input, packageStates: ["AUTHORIZED", "READY"] }).PACKAGE.state, "PASS");
  });

  it("keeps legal failed even when QC passed", () => {
    const gates = deriveSupplyGates({
      recordsAvailable: true,
      verifiedAssetCount: 1,
      qcStatus: "PASSED",
      legalStatus: "ACTION_REQUIRED",
      rights: [grant()],
      packageState: "READY",
      now,
    });
    assert.equal(gates.QC.state, "PASS");
    assert.equal(gates.LEGAL.state, "FAILED");
    assert.equal(gates.PACKAGE.state, "UNAVAILABLE");
  });

  it("reports an explicit unavailable state when the phase-1 tables are absent", () => {
    const gates = deriveSupplyGates({
      recordsAvailable: false,
      verifiedAssetCount: 0,
      qcStatus: "PASSED",
      legalStatus: "APPROVED",
      rights: [grant()],
      packageState: "AUTHORIZED",
      now,
    });
    assert.equal(gates.QC.state, "UNAVAILABLE");
    assert.equal(gates.AUTHORIZED.state, "UNAVAILABLE");
    assert.equal(gates.INGEST.state, "PENDING");
  });
});
