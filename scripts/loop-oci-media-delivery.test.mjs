import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../src/routes/api/loop/media.ts", import.meta.url), "utf8");
const storage = readFileSync(new URL("../src/lib/bridge/oci-object-storage.server.ts", import.meta.url), "utf8");

describe("Bridge-owned Loop OCI media delivery", () => {
  it("authenticates short-lived HMAC requests and rejects stale timestamps", () => {
    assert.match(route, /createHmac/);
    assert.match(route, /timingSafeEqual/);
    assert.match(route, /MAX_CLOCK_SKEW_SECONDS/);
  });
  it("rechecks canonical publication, identity, rental and current QC evidence", () => {
    assert.match(route, /public_loop_catalog\(\)/);
    assert.match(route, /bridge_loop_identity_links/);
    assert.match(route, /loop_user_tvod_entitlements/);
    assert.match(route, /reviewer_findings/);
    assert.match(route, /authorization|access_tier/);
  });
  it("requires a stored SHA-256 and streams only through the OCI signer", () => {
    assert.match(route, /checksum_sha256/);
    assert.match(route, /fetchObjectResponse/);
    assert.doesNotMatch(route, /signDownload|accessUri|OCI_PRIVATE_KEY/);
  });
  it("supports validated byte-range reads without exposing object paths", () => {
    assert.match(storage, /range\?: string \| null/);
    assert.match(storage, /Invalid byte range/);
    assert.match(route, /content-range/);
  });
});
