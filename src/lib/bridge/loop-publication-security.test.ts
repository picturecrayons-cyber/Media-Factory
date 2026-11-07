import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const publication = readFileSync(new URL("./loop-publication.ts", import.meta.url), "utf8");
const catalog = readFileSync(new URL("../loop/catalog.ts", import.meta.url), "utf8");
const loopTypes = readFileSync(new URL("../loop/types.ts", import.meta.url), "utf8");
const buyerIsolationTests = readFileSync(new URL("./loop-buyer-access.test.ts", import.meta.url), "utf8");

test("GET publication readiness is read-only and exposes only master presence", () => {
  const start = publication.indexOf("export const listLoopPublicationReadiness");
  const end = publication.indexOf("export const authorizeLoopPublication", start);
  assert.ok(start >= 0 && end > start);
  const handler = publication.slice(start, end);
  assert.doesNotMatch(handler, /\b(?:insert|update|delete)\s+(?:into\s+)?(?:bridge_loop_publications|loop_titles)\b/i);
  assert.match(handler, /has_master/);
  assert.match(handler, /Publication window has expired/);
  assert.doesNotMatch(handler, /master_key\s*,|playback_path|playbackPath/);
});

test("publication authorization never copies a private master key into playback_path", () => {
  const start = publication.indexOf("export const authorizeLoopPublication");
  const end = publication.indexOf("export const suspendLoopPublication", start);
  assert.ok(start >= 0 && end > start);
  const handler = publication.slice(start, end);
  assert.match(handler, /poster_key\}, null,/);
  assert.match(handler, /playback_path = null/);
  assert.doesNotMatch(handler, /playback_path\s*=\s*excluded\.playback_path/);
});

test("Bridge publication responses never select or return playback paths", () => {
  const start = publication.indexOf("export const getLoopPublication");
  assert.ok(start >= 0);
  const handler = publication.slice(start);
  assert.doesNotMatch(handler, /playback_path|playbackPath/);
  assert.doesNotMatch(publication, /playbackPath:/);
});

test("public Loop catalog does not select or serialize private playback paths", () => {
  assert.doesNotMatch(catalog, /playback_path|playbackPath/);
  assert.doesNotMatch(loopTypes, /playbackPath/);
});

test("consumer entitlement remains fail-closed until signed delivery exists", () => {
  const start = catalog.indexOf("export const checkPlaybackEntitlement");
  assert.ok(start >= 0);
  const handler = catalog.slice(start);
  assert.doesNotMatch(handler, /canPlay:\s*true/);
  assert.match(handler, /canPlay:\s*false/);
});

test("Buyer A/B organization-isolation regression remains covered", () => {
  assert.match(buyerIsolationTests, /Buyer A\/B isolation/);
  assert.match(buyerIsolationTests, /another-buyer-org/);
});
