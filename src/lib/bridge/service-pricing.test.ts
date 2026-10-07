import test from "node:test";
import assert from "node:assert/strict";
import { detectRequiredWork } from "./service-pricing.ts";

test("existing accepted subtitle is not charged", () => {
  const result = detectRequiredWork({
    runtimeMinutes: 120,
    destinations: [{ kind: "OTT", name: "Example OTT" }],
    assets: [
      { kind: "master", ready: true, source: "asset_version" },
      { kind: "audio", ready: true, source: "asset_version" },
      { kind: "poster", ready: true, source: "asset_version" },
      { kind: "subtitle", ready: true, source: "asset_version" },
    ],
    subtitleLanguages: ["English"],
    requestedDubbingLanguages: [],
  });
  assert.equal(result.requiredWork.some((x) => x.serviceCode === "LOC_SUBTITLE_TRANSLATION"), false);
});

test("missing requested subtitle creates a minute-based work item", () => {
  const result = detectRequiredWork({
    runtimeMinutes: 120,
    destinations: [{ kind: "OTT", name: "Example OTT" }],
    assets: [
      { kind: "master", ready: true, source: "asset_version" },
      { kind: "audio", ready: true, source: "asset_version" },
      { kind: "poster", ready: true, source: "asset_version" },
    ],
    subtitleLanguages: ["English"],
    requestedDubbingLanguages: [],
  });
  assert.deepEqual(result.requiredWork.find((x) => x.serviceCode === "LOC_SUBTITLE_TRANSLATION")?.quantity, 120);
});

test("app and OTT delivery are separate commercial work", () => {
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
  assert.equal(result.requiredWork.filter((x) => x.serviceCode === "DELIVERY_OTT").length, 1);
  assert.equal(result.requiredWork.filter((x) => x.serviceCode === "DELIVERY_APP").length, 1);
  assert.equal(result.requiredWork.filter((x) => x.serviceCode === "PKG_OTT").length, 1);
  assert.equal(result.requiredWork.filter((x) => x.serviceCode === "PKG_APP").length, 1);
});

test("digital/theatrical is explicit even when no generic handling fee is invented", () => {
  const result = detectRequiredWork({
    runtimeMinutes: 100,
    destinations: [{ kind: "DIGITAL_THEATRICAL", name: "Theatrical Partner" }],
    assets: [],
    subtitleLanguages: [],
    requestedDubbingLanguages: [],
  });
  assert.equal(result.requiredWork.some((x) => x.serviceCode === "DELIVERY_THEATRICAL" && x.destination === "Theatrical Partner"), true);
});
