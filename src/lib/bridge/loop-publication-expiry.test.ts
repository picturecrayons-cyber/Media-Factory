import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalog = readFileSync(new URL("../loop/catalog.ts", import.meta.url), "utf8");
const publication = readFileSync(new URL("./loop-publication.ts", import.meta.url), "utf8");

test("public catalog and title details enforce active Bridge publication windows", () => {
  const catalogFn = catalog.slice(catalog.indexOf("export const getLoopCatalog"), catalog.indexOf("export const getLoopTitleDetails"));
  const detailsFn = catalog.slice(catalog.indexOf("export const getLoopTitleDetails"), catalog.indexOf("export const checkPlaybackEntitlement"));
  for (const source of [catalogFn, detailsFn]) {
    assert.match(source, /authorization_status/);
    assert.match(source, /window_start is null or p\.window_start <= now\(\)/);
    assert.match(source, /window_end is null or p\.window_end > now\(\)/);
    assert.match(source, /l\.listed = true/);
    assert.match(source, /l\.status = 'approved'/);
  }
});

test("FREE, SVOD and TVOD playback all require an active authorized publication", () => {
  const start = catalog.indexOf("export const checkPlaybackEntitlement");
  const source = catalog.slice(start);
  assert.match(source, /join bridge_loop_publications p on p\.loop_title_id = l\.id/);
  assert.match(source, /lower\(p\.authorization_status\) in \('authorized', 'live'\)/);
  assert.match(source, /p\.window_end is null or p\.window_end > now\(\)/);
  assert.ok(source.indexOf("if (title.access_tier === \"FREE\")") > source.indexOf("const title = titles[0]"));
});

test("expiry is a separate verified, permission-gated, auditable POST mutation", () => {
  const start = publication.indexOf("export const expireLoopPublication");
  const end = publication.indexOf("export const suspendLoopPublication", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const source = publication.slice(start, end);
  assert.match(source, /createServerFn\(\{ method: "POST" \}\)/);
  assert.match(source, /requireVerifiedActor/);
  assert.match(source, /assertPermission\(actor, "loop\.revoke"\)/);
  assert.match(source, /window_end <= now\(\)/);
  assert.match(source, /set authorization_status = 'expired'/);
  assert.match(source, /set status = 'expired', listed = false, published = false/);
  assert.match(source, /action: "distribution\.expire_loop"/);
  assert.match(source, /writeAudit/);
  assert.match(source, /reason: z\.string\(\)\.min\(8\)/);
});

test("suspend and revoke both remove consumer visibility", () => {
  const suspendStart = publication.indexOf("export const suspendLoopPublication");
  const revokeStart = publication.indexOf("export const revokeLoopPublication");
  const extendStart = publication.indexOf("export const extendDistributionWindow");
  const suspend = publication.slice(suspendStart, revokeStart);
  const revoke = publication.slice(revokeStart, extendStart);
  for (const source of [suspend, revoke]) {
    assert.match(source, /listed = false, published = false/);
    assert.match(source, /writeAudit/);
  }
});
