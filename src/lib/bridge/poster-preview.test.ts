import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findVerifiedPosterAsset } from "./poster-preview.ts";

const asset = (
  id: string,
  overrides: Partial<{
    kind: string;
    verified: boolean;
    contentType: string | null;
  }> = {},
) => ({
  id,
  kind: overrides.kind ?? "poster_vertical",
  verified: overrides.verified ?? true,
  contentType: overrides.contentType === undefined ? "image/png" : overrides.contentType,
});

describe("verified poster preview selection", () => {
  it("selects the first verified image poster in newest-first order", () => {
    const newest = asset("newest");
    const older = asset("older");
    assert.equal(findVerifiedPosterAsset([newest, older])?.id, "newest");
  });

  it("supports the legacy poster kind", () => {
    const legacy = asset("legacy", { kind: "poster" });
    assert.equal(findVerifiedPosterAsset([legacy])?.id, "legacy");
  });

  it("ignores unverified posters and non-image assets", () => {
    assert.equal(
      findVerifiedPosterAsset([
        asset("unverified", { verified: false }),
        asset("pdf", { contentType: "application/pdf" }),
        asset("trailer", { kind: "screener" }),
      ]),
      null,
    );
  });
});
