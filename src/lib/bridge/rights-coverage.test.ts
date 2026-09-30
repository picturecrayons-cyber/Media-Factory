import assert from "node:assert/strict";
import test from "node:test";
import { findCoveringRightsGrant, type BridgeRightsGrant } from "./rights-coverage.ts";

const baseGrant: BridgeRightsGrant = {
  id: "grant-1",
  status: "VALID",
  territories: ["WORLDWIDE"],
  languages: ["Malayalam"],
  media: ["OTT"],
  window_start: "2026-01-01T00:00:00.000Z",
  window_end: "2027-01-01T00:00:00.000Z",
  exclusivity: "NON_EXCLUSIVE",
};

const request = {
  destination: "CRAYONS_LOOP" as const,
  territories: ["IN"],
  languages: ["Malayalam"],
  exploitationModels: ["TVOD"],
  windowStart: "2026-10-01T00:00:00.000Z",
  windowEnd: "2026-12-01T00:00:00.000Z",
  now: new Date("2026-09-30T00:00:00.000Z"),
};

test("accepts an active worldwide OTT grant that covers the requested window", () => {
  assert.equal(findCoveringRightsGrant([baseGrant], request)?.id, "grant-1");
});

test("fails closed when there is no rights grant", () => {
  assert.equal(findCoveringRightsGrant([], request), null);
});

test("rejects omitted or null publication ends under a finite grant", () => {
  assert.equal(findCoveringRightsGrant([baseGrant], { ...request, windowEnd: undefined }), null);
  assert.equal(findCoveringRightsGrant([baseGrant], { ...request, windowEnd: null }), null);
});

test("allows an unbounded publication only under an unbounded grant", () => {
  assert.equal(
    findCoveringRightsGrant([{ ...baseGrant, window_end: null }], { ...request, windowEnd: null })?.id,
    "grant-1"
  );
});

test("accepts a publication ending exactly at the grant end", () => {
  assert.equal(findCoveringRightsGrant([baseGrant], { ...request, windowEnd: "2027-01-01T00:00:00.000Z" })?.id, "grant-1");
});

test("broad media tokens preserve explicit exploitation-model restrictions", () => {
  for (const token of ["OTT", "STREAMING", "DIGITAL", "ALL", "*"]) {
    const grant = { ...baseGrant, media: [token, "SVOD"] };
    assert.equal(findCoveringRightsGrant([grant], request), null);
    assert.equal(findCoveringRightsGrant([grant], { ...request, exploitationModels: ["SVOD"] })?.id, "grant-1");
    assert.equal(findCoveringRightsGrant([grant], { ...request, exploitationModels: ["SVOD", "TVOD"] }), null);
  }
});

test("rejects expired or revoked grants", () => {
  assert.equal(findCoveringRightsGrant([{ ...baseGrant, status: "EXPIRED" }], request), null);
  assert.equal(findCoveringRightsGrant([{ ...baseGrant, status: "REVOKED" }], request), null);
});

test("rejects territory and language mismatches", () => {
  assert.equal(findCoveringRightsGrant([{ ...baseGrant, territories: ["US"] }], request), null);
  assert.equal(findCoveringRightsGrant([{ ...baseGrant, languages: ["English"] }], request), null);
});

test("rejects media/exploitation mismatches", () => {
  assert.equal(findCoveringRightsGrant([{ ...baseGrant, media: ["THEATRICAL"] }], request), null);
  assert.equal(findCoveringRightsGrant([{ ...baseGrant, media: ["CRAYONS_LOOP", "SVOD"] }], request), null);
});

test("rejects a publication window outside the grant", () => {
  assert.equal(
    findCoveringRightsGrant(
      [baseGrant],
      { ...request, windowEnd: "2027-02-01T00:00:00.000Z" }
    ),
    null
  );
});
