import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BRIDGE_CANONICAL_ORIGIN, isRetiredBridgeOrigin, resolveBridgeCanonicalOrigin } from "./origin.ts";

describe("Bridge canonical origin", () => {
  it("falls back to the approved production origin when configuration is missing or invalid", () => {
    assert.equal(resolveBridgeCanonicalOrigin(undefined), BRIDGE_CANONICAL_ORIGIN);
    assert.equal(resolveBridgeCanonicalOrigin("not a url"), BRIDGE_CANONICAL_ORIGIN);
  });

  it("rejects retired StreamVista origins", () => {
    assert.equal(isRetiredBridgeOrigin("https://bridge.streamvista.in"), true);
    assert.equal(isRetiredBridgeOrigin("https://foo.streamvista.in"), true);
    assert.equal(resolveBridgeCanonicalOrigin("https://bridge.streamvista.in"), BRIDGE_CANONICAL_ORIGIN);
  });

  it("preserves explicitly permitted concrete origins", () => {
    assert.equal(resolveBridgeCanonicalOrigin("https://preview.example.com/path"), "https://preview.example.com");
  });
});
