import test from "node:test";
import assert from "node:assert/strict";
import { hasExclusiveScopeConflict, type LicenseDealScope } from "./licensing-deal-policy.ts";

const existing: LicenseDealScope = {
  rightsCategory: "SVOD",
  territories: ["IN"],
  languages: ["Malayalam"],
  mediaModes: ["SVOD"],
  termStart: "2026-01-01",
  termEnd: "2026-12-31",
  exclusivity: "EXCLUSIVE",
  status: "ACCEPTED",
};

function candidate(overrides: Partial<LicenseDealScope> = {}): LicenseDealScope {
  return { ...existing, status: "DRAFT", exclusivity: "NON_EXCLUSIVE", ...overrides };
}

test("blocks overlapping exclusive rights for the same title scope", () => {
  assert.equal(hasExclusiveScopeConflict(candidate({ exclusivity: "NON_EXCLUSIVE" }), [existing]), true);
});

test("allows disjoint territories", () => {
  assert.equal(hasExclusiveScopeConflict(candidate({ territories: ["GB"] }), [existing]), false);
});

test("allows disjoint languages or media modes", () => {
  assert.equal(hasExclusiveScopeConflict(candidate({ languages: ["English"] }), [existing]), false);
  assert.equal(hasExclusiveScopeConflict(candidate({ mediaModes: ["TVOD"] }), [existing]), false);
});

test("allows non-exclusive overlapping deals when both are non-exclusive", () => {
  assert.equal(hasExclusiveScopeConflict(candidate(), [{ ...existing, exclusivity: "NON_EXCLUSIVE" }]), false);
});

test("ignores non-active historical deals and disjoint terms", () => {
  assert.equal(hasExclusiveScopeConflict(candidate(), [{ ...existing, status: "CANCELLED" }]), false);
  assert.equal(hasExclusiveScopeConflict(candidate({ termStart: "2027-01-01", termEnd: "2027-12-31" }), [existing]), false);
});

test("matches worldwide aliases against a country scope", () => {
  assert.equal(hasExclusiveScopeConflict(candidate({ territories: ["WORLDWIDE"] }), [existing]), true);
});
