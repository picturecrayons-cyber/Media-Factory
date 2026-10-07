import test from "node:test";
import assert from "node:assert/strict";
import { detectRequiredWork } from "./service-pricing.ts";

const base = {
  runtimeMinutes: 120,
  destinations: [{ kind: "OTT" as const, name: "Example OTT" }],
  requestedDubbingLanguages: [],
};

test("accepted subtitle for the requested language is not charged", () => {
  const result = detectRequiredWork({
    ...base,
    assets: [{ kind: "subtitle", ready: true, source: "asset_version", language: "English" }],
    subtitleLanguages: ["English"],
  });
  assert.equal(result.requiredWork.some((x) => x.serviceCode === "LOC_SUBTITLE_TRANSLATION"), false);
});

test("missing requested subtitle language is charged even when another language exists", () => {
  const result = detectRequiredWork({
    ...base,
    assets: [{ kind: "subtitle", ready: true, source: "asset_version", language: "English" }],
    subtitleLanguages: ["English", "Hindi"],
  });
  const hindi = result.requiredWork.find((x) => x.serviceCode === "LOC_SUBTITLE_TRANSLATION" && x.language === "Hindi");
  assert.equal(hindi?.quantity, 120);
  assert.equal(result.requiredWork.some((x) => x.serviceCode === "LOC_SUBTITLE_TRANSLATION" && x.language === "English"), false);
});

test("passed QC suppresses duplicate technical QC charge", () => {
  const result = detectRequiredWork({
    ...base,
    assets: [],
    subtitleLanguages: [],
    qcPassed: true,
  });
  assert.equal(result.requiredWork.some((x) => x.serviceCode === "QC_TECHNICAL"), false);
});

test("app and OTT remain separate destination work", () => {
  const result = detectRequiredWork({
    runtimeMinutes: 90,
    destinations: [
      { kind: "OTT", name: "OTT A" },
      { kind: "APP", name: "App A" },
    ],
    assets: [],
    subtitleLanguages: [],
    requestedDubbingLanguages: [],
  });
  assert.equal(result.requiredWork.some((x) => x.serviceCode === "PKG_OTT" && x.destination === "OTT A"), true);
  assert.equal(result.requiredWork.some((x) => x.serviceCode === "DELIVERY_OTT" && x.destination === "OTT A"), true);
  assert.equal(result.requiredWork.some((x) => x.serviceCode === "PKG_APP" && x.destination === "App A"), true);
  assert.equal(result.requiredWork.some((x) => x.serviceCode === "DELIVERY_APP" && x.destination === "App A"), true);
});

test("missing master, audio and artwork become explicit work items", () => {
  const result = detectRequiredWork({
    runtimeMinutes: 90,
    destinations: [{ kind: "BUYER", name: "Buyer A" }],
    assets: [],
    subtitleLanguages: [],
    requestedDubbingLanguages: [],
  });
  assert.deepEqual(
    result.requiredWork.map((x) => x.serviceCode),
    ["MASTER_VIDEO", "MASTER_AUDIO", "PREP_ARTWORK", "QC_TECHNICAL", "DELIVERY_BUYER"],
  );
});
