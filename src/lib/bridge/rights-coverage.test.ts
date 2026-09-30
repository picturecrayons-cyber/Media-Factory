import assert from "node:assert/strict";
import test from "node:test";
import { findCoveringRightsGrant, type BridgeRightsGrant } from "./rights-coverage";

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
