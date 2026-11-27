import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { downloadDecision } from "./delivery-policy.ts";

describe("master download denial", () => {
  it("never lets a buyer entitlement download a master", () => {
    const decision = downloadDecision({
      kind: "master",
      actorIsOwner: false,
      actorIsInternal: false,
      actorCanPreviewArtwork: false,
      accountType: "buyer",
      hasLicenseEntitlement: true,
    });
    assert.equal(decision.allow, false);
    assert.match(decision.reason, /does not authorize a master/);
  });

  it("never lets a buyer entitlement download a technical package", () => {
    const decision = downloadDecision({
      kind: "technical",
      actorIsOwner: false,
      actorIsInternal: false,
      actorCanPreviewArtwork: false,
      accountType: "buyer",
      hasLicenseEntitlement: true,
    });
    assert.equal(decision.allow, false);
    assert.match(decision.reason, /does not authorize technical package downloads/);
  });

  it("lets internal reviewers with buyer accounts download a master", () => {
    assert.equal(downloadDecision({ kind: "master", actorIsOwner: false, actorIsInternal: true,
      actorCanPreviewArtwork: false, accountType: "buyer", hasLicenseEntitlement: false }).allow, true);
  });

  it("lets the owner download a master and a buyer download only a screener", () => {
    assert.equal(downloadDecision({
      kind: "master",
      actorIsOwner: true,
      actorIsInternal: false,
      actorCanPreviewArtwork: false,
      accountType: "studio",
      hasLicenseEntitlement: false,
    }).allow, true);
    assert.equal(downloadDecision({
      kind: "screener",
      actorIsOwner: false,
      actorIsInternal: false,
      actorCanPreviewArtwork: false,
      accountType: "buyer",
      hasLicenseEntitlement: true,
    }).allow, true);
    assert.equal(downloadDecision({
      kind: "screener",
      actorIsOwner: false,
      actorIsInternal: false,
      actorCanPreviewArtwork: false,
      accountType: "buyer",
      hasLicenseEntitlement: false,
    }).allow, false);
  });
});

describe("Studio collaborator artwork preview", () => {
  it("allows an authorized Studio collaborator to preview all artwork variants", () => {
    for (const kind of ["poster", "poster_vertical", "poster_horizontal", "thumbnail"]) {
      const decision = downloadDecision({
        kind,
        actorIsOwner: false,
        actorIsInternal: false,
        actorCanPreviewArtwork: true,
        accountType: "studio",
        hasLicenseEntitlement: false,
      });
      assert.equal(decision.allow, true, kind);
    }
  });

  it("does not let Studio collaboration authorize masters or technical packages", () => {
    for (const kind of ["master", "technical"]) {
      const decision = downloadDecision({
        kind,
        actorIsOwner: false,
        actorIsInternal: false,
        actorCanPreviewArtwork: true,
        accountType: "studio",
        hasLicenseEntitlement: false,
      });
      assert.equal(decision.allow, false, kind);
    }
  });

  it("does not grant artwork preview to unrelated accounts", () => {
    for (const kind of ["poster_vertical", "poster_horizontal", "thumbnail"]) {
      const decision = downloadDecision({
        kind,
        actorIsOwner: false,
        actorIsInternal: false,
        actorCanPreviewArtwork: false,
        accountType: "studio",
        hasLicenseEntitlement: false,
      });
      assert.equal(decision.allow, false, kind);
    }
  });
});
