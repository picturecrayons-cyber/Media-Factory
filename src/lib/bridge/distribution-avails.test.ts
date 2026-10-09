import assert from "node:assert/strict";
import test from "node:test";
import { assessDistributionAvails, hasExclusiveRightsOverlap, type DistributionAvailsRow } from "./distribution-avails-policy.ts";

const base: DistributionAvailsRow = {
  id: "title-1",
  name: "Example Film",
  language: "Malayalam",
  year: 2024,
  runtime_minutes: 100,
  content_type: "Feature",
  status: "LICENSING_READY",
  master_key: "masters/example.mp4",
  poster_key: "posters/example.jpg",
  master_verified: true,
  qc_verified: true,
  legal_review_recorded: true,
  valid_rights_grants: [{
    id: "grant-1",
    territories: ["IN"],
    languages: ["Malayalam"],
    media: ["SVOD"],
    window_start: "2026-01-01T00:00:00.000Z",
    window_end: "2027-01-01T00:00:00.000Z",
    exclusivity: "NON_EXCLUSIVE",
    holdbacks: [],
  }],
};

test("avails assessment requires every core evidence gate", () => {
  const result = assessDistributionAvails(base, new Date("2026-10-09T00:00:00.000Z"));
  assert.equal(result.decision, "NEEDS_OPERATOR_REVIEW");
  assert.deepEqual(result.blockers, []);
});

test("missing master, QC, legal review and structured rights fail closed", () => {
  const result = assessDistributionAvails({
    ...base, master_verified: false, qc_verified: false, legal_review_recorded: false, valid_rights_grants: [],
  }, new Date("2026-10-09T00:00:00.000Z"));
  assert.equal(result.decision, "HOLD");
  assert.ok(result.blockers.some((item) => item.includes("master")));
  assert.ok(result.blockers.some((item) => item.includes("QC")));
  assert.ok(result.blockers.some((item) => item.includes("legal")));
  assert.ok(result.blockers.some((item) => item.includes("rights grant")));
});

test("expired or malformed rights windows are not avails", () => {
  for (const windowEnd of ["2026-10-08T00:00:00.000Z", "not-a-date"]) {
    const result = assessDistributionAvails({
      ...base,
      valid_rights_grants: [{ ...base.valid_rights_grants[0], window_end: windowEnd }],
    }, new Date("2026-10-09T00:00:00.000Z"));
    assert.equal(result.decision, "HOLD");
  }
});

test("missing core metadata is blocked even when other evidence exists", () => {
  const result = assessDistributionAvails({ ...base, language: null }, new Date("2026-10-09T00:00:00.000Z"));
  assert.equal(result.decision, "HOLD");
  assert.ok(result.blockers.includes("Core metadata is incomplete"));
});

test("exclusive grants with overlapping scope require operator review", () => {
  const grant = {
    territories: ["IN"],
    languages: ["Malayalam"],
    media: ["SVOD"],
    window_start: "2026-01-01T00:00:00.000Z",
    window_end: "2027-01-01T00:00:00.000Z",
    exclusivity: "EXCLUSIVE",
  };
  assert.equal(hasExclusiveRightsOverlap([grant, { ...grant, exclusivity: "NON_EXCLUSIVE" }]), true);
  assert.equal(hasExclusiveRightsOverlap([{ ...grant, exclusivity: "NON_EXCLUSIVE" }, { ...grant, exclusivity: "NON_EXCLUSIVE" }]), false);
});
