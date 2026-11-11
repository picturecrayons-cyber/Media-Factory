import assert from "node:assert/strict";
import test from "node:test";
import {
  amazonSubmissionIdempotencyKey,
  evaluateAmazonPublishingEligibility,
  mapAmazonProviderStatus,
  type AmazonPublishingEligibilityInput,
} from "./amazon-prime-video.ts";

const base: AmazonPublishingEligibilityInput = {
  territoryCode: "US",
  offerType: "svod",
  now: "2026-11-11T12:00:00.000Z",
  avail: {
    territoryCode: "US",
    offerTypes: ["svod", "tvod"],
    source: "amazon_account_avails",
    evidenceReference: "amazon-avails:account-1:US",
    checkedAt: "2026-11-11T10:00:00.000Z",
    validUntil: "2026-11-12T10:00:00.000Z",
  },
  rights: {
    territoryCodes: ["US"],
    offerTypes: ["svod"],
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2027-01-01T00:00:00.000Z",
    verified: true,
    evidenceReference: "rights:grant-1",
  },
  localizedPackage: {
    languageTag: "en-US",
    metadataComplete: true,
    artworkApproved: true,
    captionsReady: true,
    audioReady: true,
    mezzanineReady: true,
  },
  requiredLanguageTag: "en-US",
  partnerMode: "managed_slate",
  partnerModeVerified: true,
};

test("allows a title only when current account Avails, verified rights and complete assets agree", () => {
  const result = evaluateAmazonPublishingEligibility(base);
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.evidenceReferences, [
    "amazon-avails:account-1:US",
    "rights:grant-1",
  ]);
});

test("fails closed when Amazon territory Avails are unknown", () => {
  const result = evaluateAmazonPublishingEligibility({ ...base, avail: null });
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("TERRITORY_AVAIL_NOT_VERIFIED"));
});

test("blocks territory and offer mismatches", () => {
  const result = evaluateAmazonPublishingEligibility({
    ...base,
    territoryCode: "IN",
    offerType: "tvod",
  });
  assert.ok(result.reasons.includes("AVAIL_TERRITORY_MISMATCH"));
  assert.ok(result.reasons.includes("RIGHTS_TERRITORY_MISMATCH"));
  assert.ok(result.reasons.includes("RIGHTS_OFFER_TYPE_MISMATCH"));
});

test("blocks expired, future-dated and malformed Avails evidence", () => {
  for (const avail of [
    { ...base.avail!, validUntil: "2026-11-11T11:59:59.000Z" },
    { ...base.avail!, checkedAt: "2026-11-11T12:01:00.000Z" },
    { ...base.avail!, validUntil: "not-a-date" },
  ]) {
    const result = evaluateAmazonPublishingEligibility({ ...base, avail });
    assert.ok(result.reasons.includes("AVAIL_EVIDENCE_STALE_OR_INVALID"));
  }
});

test("blocks missing or unverified partner mode and rights", () => {
  const partner = evaluateAmazonPublishingEligibility({
    ...base,
    partnerMode: null,
    partnerModeVerified: false,
  });
  assert.ok(partner.reasons.includes("AMAZON_PARTNER_MODE_NOT_VERIFIED"));

  const rights = evaluateAmazonPublishingEligibility({
    ...base,
    rights: { ...base.rights!, verified: false },
  });
  assert.ok(rights.reasons.includes("RIGHTS_NOT_VERIFIED"));
});

test("blocks rights windows outside the current term and active holdbacks", () => {
  const expired = evaluateAmazonPublishingEligibility({
    ...base,
    rights: { ...base.rights!, endsAt: "2026-11-10T00:00:00.000Z" },
  });
  assert.ok(expired.reasons.includes("RIGHTS_WINDOW_INVALID_OR_EXPIRED"));

  const holdback = evaluateAmazonPublishingEligibility({
    ...base,
    rights: { ...base.rights!, holdbackEndsAt: "2026-11-12T00:00:00.000Z" },
  });
  assert.ok(holdback.reasons.includes("RIGHTS_HOLDBACK_ACTIVE"));

  const malformedHoldback = evaluateAmazonPublishingEligibility({
    ...base,
    rights: { ...base.rights!, holdbackEndsAt: "invalid-date" },
  });
  assert.ok(malformedHoldback.reasons.includes("RIGHTS_HOLDBACK_DATE_INVALID"));
});

test("blocks incomplete localized package assets", () => {
  const result = evaluateAmazonPublishingEligibility({
    ...base,
    localizedPackage: {
      ...base.localizedPackage!,
      languageTag: "ml-IN",
      metadataComplete: false,
      artworkApproved: false,
      captionsReady: false,
      audioReady: false,
      mezzanineReady: false,
    },
  });
  for (const reason of [
    "LANGUAGE_NOT_COVERED",
    "LOCALIZED_METADATA_INCOMPLETE",
    "ARTWORK_NOT_APPROVED",
    "CAPTIONS_NOT_READY",
    "AUDIO_NOT_READY",
    "MEZZANINE_NOT_READY",
  ]) assert.ok(result.reasons.includes(reason));
});

test("maps only explicit provider lifecycle states and blocks unknown statuses", () => {
  assert.equal(mapAmazonProviderStatus("submitted"), "submitted");
  assert.equal(mapAmazonProviderStatus("selected"), "accepted");
  assert.equal(mapAmazonProviderStatus("delivered"), "delivered");
  assert.equal(mapAmazonProviderStatus("published"), "published");
  assert.equal(mapAmazonProviderStatus("unknown-provider-state"), "blocked");
});

test("creates stable, normalized idempotency keys", () => {
  const first = amazonSubmissionIdempotencyKey({
    titleId: " title-1 ",
    titleVersionId: " v2 ",
    territoryCode: "us",
    offerType: "svod",
    languageTag: "EN-us",
  });
  const second = amazonSubmissionIdempotencyKey({
    titleId: "title-1",
    titleVersionId: "v2",
    territoryCode: "US",
    offerType: "svod",
    languageTag: "en-US",
  });
  assert.equal(first, second);
  assert.equal(first, "amazon:title-1:v2:US:svod:en-us");
});
