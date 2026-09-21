import assert from "node:assert/strict";
import test from "node:test";
import { CERTIFICATION_TEXT, classifyScreenerUrl, COMMERCIAL_PREFERENCE_LABELS } from "./submission-policy.ts";

test("screener never becomes verified from a URL string alone", () => {
  const r = classifyScreenerUrl("https://cdn.example.com/film.m3u8");
  assert.equal(r.status, "pending");
  assert.notEqual(r.status, "verified");
});

test("http screeners fail closed", () => {
  assert.equal(classifyScreenerUrl("http://cdn.example.com/film.mp4").status, "failed");
});

test("commercial prefs have no hardcoded Loop consumer prices", () => {
  const blob = JSON.stringify(COMMERCIAL_PREFERENCE_LABELS) + CERTIFICATION_TEXT;
  assert.doesNotMatch(blob, /₹79/);
  assert.doesNotMatch(blob, /₹249/);
});
