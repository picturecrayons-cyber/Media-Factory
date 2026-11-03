import assert from "node:assert/strict";
import test from "node:test";
import {
  isBuyerVisibleLanguageRight,
  isBuyerVisibleLicensePackage,
  toBuyerVisibleLanguageRight,
} from "./buyer-license-views.ts";

test("Buyer language-right DTO includes safe status and strips internal evidence and pricing", () => {
  const row = {
    id: "right-1",
    title_id: "title-private",
    language: "Hindi",
    right_type: "DUBBING",
    territories: ["India"],
    media: ["OTT"],
    window_start: "2026-01-01T00:00:00.000Z",
    window_end: "2027-01-01T00:00:00.000Z",
    exclusivity: "NON_EXCLUSIVE",
    status: "VALID",
    asking_price_paise: 900000,
    evidence: [{ contract: "internal-contract-ref" }],
  };
  const dto = toBuyerVisibleLanguageRight(row);

  assert.deepEqual(dto, {
    id: "right-1",
    language: "Hindi",
    rightType: "DUBBING",
    territories: ["India"],
    media: ["OTT"],
    windowStart: "2026-01-01T00:00:00.000Z",
    windowEnd: "2027-01-01T00:00:00.000Z",
    exclusivity: "NON_EXCLUSIVE",
    status: "VALID",
  });
  assert.doesNotMatch(JSON.stringify(dto), /title_id|asking_price|evidence|contract/i);
});

test("Buyer rights and packages fail closed unless every linked right is valid", () => {
  assert.equal(isBuyerVisibleLanguageRight("VALID"), true);
  assert.equal(isBuyerVisibleLanguageRight("PENDING"), false);
  assert.equal(isBuyerVisibleLanguageRight("REVOKED"), false);

  const valid = new Set(["right-a", "right-b"]);
  assert.equal(isBuyerVisibleLicensePackage("READY", ["right-a", "right-b"], valid), true);
  assert.equal(isBuyerVisibleLicensePackage("IN_NEGOTIATION", ["right-a"], valid), true);
  assert.equal(isBuyerVisibleLicensePackage("READY", ["right-a", "right-missing"], valid), false);
  assert.equal(isBuyerVisibleLicensePackage("DRAFT", ["right-a"], valid), false);
  assert.equal(isBuyerVisibleLicensePackage("READY", [], valid), false);
});
