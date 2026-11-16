import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const homepage = readFileSync(new URL("../../routes/index.tsx", import.meta.url), "utf8");

describe("Bridge public homepage rendering", () => {
  it("loads public CMS content on the route loader with a safe fallback", () => {
    assert.match(homepage, /loader:\s*async\s*\(\)\s*=>/);
    assert.match(homepage, /getPublicSiteContent\(\)/);
    assert.match(homepage, /DEFAULT_BRIDGE_SITE_CONTENT/);
  });

  it("renders CMS-controlled headings and hero copy", () => {
    for (const field of ["heroTitle", "heroBody", "workflowHeading", "audienceHeading", "finalCtaHeading"]) {
      assert.match(homepage, new RegExp(`content\\.${field}\\b`));
    }
  });

  it("keeps public HTML available while client authentication resolves", () => {
    assert.doesNotMatch(homepage, /Opening workspace…/);
    assert.match(homepage, /!isPending && user && !sessionQ\.isPending/);
  });

  it("declares canonical URL and page metadata for Bridge", () => {
    assert.match(homepage, /rel: "canonical", href: "https:\/\/crayonspictures\.in\//);
    assert.match(homepage, /property: "og:title"/);
    assert.match(homepage, /name: "description"/);
  });
});
