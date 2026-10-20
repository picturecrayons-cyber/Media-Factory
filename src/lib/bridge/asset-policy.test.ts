import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assetVisibilityDecision,
  assetPreviewDecision,
  assetDownloadDecision,
  assetUploadDecision,
  assetReplaceDecision,
  assetDeleteDecision,
  getAssetPermissions,
} from "./asset-policy.ts";
import type { Actor } from "./rbac.ts";
import type { TitleStatus } from "./types.ts";

function actor(
  userId: string,
  accountType: Actor["accountType"],
  internalRole: Actor["internalRole"] = null,
  emailVerified = true,
): Actor {
  return { userId, accountType, internalRole, emailVerified };
}

const superAdmin = () => actor("superadmin-1", "independent_creator", "super_admin");
const admin = () => actor("admin-1", "independent_creator", "admin");
const qcReviewer = () => actor("qc-1", "independent_creator", "qc_reviewer");
const legalReviewer = () => actor("legal-1", "independent_creator", "legal_reviewer");
const studioOwner = () => actor("owner-studio-1", "studio", null);
const creatorOwner = () => actor("owner-creator-1", "independent_creator", null);
const otherCreator = () => actor("other-creator-2", "independent_creator", null);
const buyer = () => actor("buyer-1", "buyer", null);
const viewer = () => actor("viewer-1", "independent_creator", "viewer");
const investor = () => actor("investor-1", "investor", null);
const unverifiedOwner = () => actor("unverified-1", "independent_creator", null, false);

function makeTitle(opts: { id?: string; ownerUserId?: string; status?: TitleStatus } = {}) {
  return {
    id: opts.id ?? "title-abc-12345",
    ownerUserId: opts.ownerUserId ?? "owner-studio-1",
    status: opts.status ?? "PREPARING",
  };
}

describe("Asset RBAC Policy Matrix", () => {
  describe("Super Admin permissions", () => {
    const title = makeTitle();
    it("can view all asset kinds", () => {
      for (const kind of ["master", "screener", "poster_vertical", "subtitle", "censor_certificate", "technical"]) {
        assert.equal(assetVisibilityDecision(superAdmin(), title, kind).allow, true);
      }
    });

    it("can preview all asset kinds", () => {
      for (const kind of ["master", "screener", "poster_vertical", "subtitle", "censor_certificate"]) {
        assert.equal(assetPreviewDecision(superAdmin(), title, kind).allow, true);
      }
    });

    it("can download all asset kinds", () => {
      for (const kind of ["master", "screener", "poster_vertical", "subtitle", "censor_certificate", "technical"]) {
        assert.equal(assetDownloadDecision(superAdmin(), title, kind).allow, true);
      }
    });

    it("can upload, replace, and delete in PREPARING", () => {
      assert.equal(assetUploadDecision(superAdmin(), title, "master").allow, true);
      assert.equal(assetReplaceDecision(superAdmin(), title, "poster_vertical").allow, true);
      assert.equal(assetDeleteDecision(superAdmin(), title, "subtitle").allow, true);
    });

    it("cannot upload or delete when status has advanced past PREPARING", () => {
      const qcTitle = makeTitle({ status: "QC_REVIEW" });
      assert.equal(assetUploadDecision(superAdmin(), qcTitle, "master").allow, false);
      assert.equal(assetDeleteDecision(superAdmin(), qcTitle, "master").allow, false);
    });
  });

  describe("Title Owner (Studio / Creator) permissions", () => {
    const title = makeTitle({ ownerUserId: "owner-studio-1" });
    it("can view, preview, download all assets on own title", () => {
      const owner = studioOwner();
      for (const kind of ["master", "screener", "poster_vertical", "subtitle", "censor_certificate", "technical"]) {
        assert.equal(assetVisibilityDecision(owner, title, kind).allow, true);
        assert.equal(assetPreviewDecision(owner, title, kind).allow, true);
        assert.equal(assetDownloadDecision(owner, title, kind).allow, true);
      }
    });

    it("can upload and replace in DRAFT, UPLOADING, and PREPARING", () => {
      const owner = studioOwner();
      for (const status of ["DRAFT", "UPLOADING", "PREPARING"] as const) {
        const t = makeTitle({ ownerUserId: "owner-studio-1", status });
        assert.equal(assetUploadDecision(owner, t, "master").allow, true);
        assert.equal(assetReplaceDecision(owner, t, "poster_vertical").allow, true);
      }
    });

    it("cannot upload or replace once submitted to QC_REVIEW or beyond", () => {
      const owner = studioOwner();
      for (const status of ["QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY", "LIVE_FOR_BUYERS"] as const) {
        const t = makeTitle({ ownerUserId: "owner-studio-1", status });
        assert.equal(assetUploadDecision(owner, t, "master").allow, false);
        assert.equal(assetReplaceDecision(owner, t, "poster_vertical").allow, false);
      }
    });

    it("cannot access assets of another owner's title", () => {
      const other = otherCreator();
      assert.equal(assetVisibilityDecision(other, title, "master").allow, false);
      assert.equal(assetPreviewDecision(other, title, "master").allow, false);
      assert.equal(assetDownloadDecision(other, title, "master").allow, false);
      assert.equal(assetUploadDecision(other, title, "master").allow, false);
    });
  });

  describe("QC Reviewer permissions", () => {
    const title = makeTitle();
    const reviewer = qcReviewer();

    it("can view all review-relevant assets including master and certificate", () => {
      for (const kind of ["master", "screener", "poster_vertical", "subtitle", "censor_certificate", "technical"]) {
        assert.equal(assetVisibilityDecision(reviewer, title, kind).allow, true);
      }
    });

    it("can preview master (secure preview), screener, artwork, subtitle, certificate", () => {
      assert.equal(assetPreviewDecision(reviewer, title, "master").allow, true);
      assert.equal(assetPreviewDecision(reviewer, title, "screener").allow, true);
      assert.equal(assetPreviewDecision(reviewer, title, "poster_vertical").allow, true);
      assert.equal(assetPreviewDecision(reviewer, title, "subtitle").allow, true);
      assert.equal(assetPreviewDecision(reviewer, title, "censor_certificate").allow, true);
    });

    it("is denied raw full-master download (preview only)", () => {
      const decision = assetDownloadDecision(reviewer, title, "master");
      assert.equal(decision.allow, false);
      assert.match(decision.reason, /secure preview only/);
    });

    it("can download technical, subtitle, certificate, and artwork", () => {
      assert.equal(assetDownloadDecision(reviewer, title, "technical").allow, true);
      assert.equal(assetDownloadDecision(reviewer, title, "subtitle").allow, true);
      assert.equal(assetDownloadDecision(reviewer, title, "censor_certificate").allow, true);
      assert.equal(assetDownloadDecision(reviewer, title, "poster_vertical").allow, true);
    });

    it("cannot upload, replace, or delete assets", () => {
      assert.equal(assetUploadDecision(reviewer, title, "master").allow, false);
      assert.equal(assetReplaceDecision(reviewer, title, "master").allow, false);
      assert.equal(assetDeleteDecision(reviewer, title, "master").allow, false);
    });
  });

  describe("Legal / Rights Reviewer permissions", () => {
    const title = makeTitle();
    const legal = legalReviewer();

    it("restricted access: cannot view master or technical package", () => {
      assert.equal(assetVisibilityDecision(legal, title, "master").allow, false);
      assert.equal(assetVisibilityDecision(legal, title, "technical").allow, false);
    });

    it("can view and preview censor certificate, subtitle, screener, artwork", () => {
      for (const kind of ["censor_certificate", "subtitle", "screener", "poster_vertical"]) {
        assert.equal(assetVisibilityDecision(legal, title, kind).allow, true);
        assert.equal(assetPreviewDecision(legal, title, kind).allow, true);
      }
    });

    it("cannot preview or download master", () => {
      assert.equal(assetPreviewDecision(legal, title, "master").allow, false);
      assert.equal(assetDownloadDecision(legal, title, "master").allow, false);
    });

    it("can download certificate, subtitle, and artwork", () => {
      assert.equal(assetDownloadDecision(legal, title, "censor_certificate").allow, true);
      assert.equal(assetDownloadDecision(legal, title, "subtitle").allow, true);
      assert.equal(assetDownloadDecision(legal, title, "poster_vertical").allow, true);
    });

    it("cannot upload or delete assets", () => {
      assert.equal(assetUploadDecision(legal, title, "censor_certificate").allow, false);
      assert.equal(assetDeleteDecision(legal, title, "censor_certificate").allow, false);
    });
  });

  describe("Buyer permissions", () => {
    const liveTitle = makeTitle({ status: "LIVE_FOR_BUYERS" });
    const b = buyer();

    it("never views master, technical, or censor certificate regardless of entitlement", () => {
      for (const entitled of [false, true]) {
        assert.equal(assetVisibilityDecision(b, liveTitle, "master", entitled).allow, false);
        assert.equal(assetVisibilityDecision(b, liveTitle, "technical", entitled).allow, false);
        assert.equal(assetVisibilityDecision(b, liveTitle, "censor_certificate", entitled).allow, false);
      }
    });

    it("unentitled buyer: can view promotional artwork and screener, but not subtitle or master", () => {
      assert.equal(assetVisibilityDecision(b, liveTitle, "poster_vertical", false).allow, true);
      assert.equal(assetVisibilityDecision(b, liveTitle, "screener", false).allow, true);
      assert.equal(assetVisibilityDecision(b, liveTitle, "subtitle", false).allow, false);
      assert.equal(assetDownloadDecision(b, liveTitle, "screener", false).allow, false);
      assert.equal(assetDownloadDecision(b, liveTitle, "poster_vertical", false).allow, true);
    });

    it("entitled buyer: can view, preview, and download approved delivery assets (screener, subtitle, artwork)", () => {
      for (const kind of ["poster_vertical", "screener", "subtitle"]) {
        assert.equal(assetVisibilityDecision(b, liveTitle, kind, true).allow, true);
        assert.equal(assetPreviewDecision(b, liveTitle, kind, true).allow, true);
        assert.equal(assetDownloadDecision(b, liveTitle, kind, true).allow, true);
      }
    });

    it("buyer cannot upload or replace assets", () => {
      assert.equal(assetUploadDecision(b, liveTitle, "poster_vertical").allow, false);
      assert.equal(assetReplaceDecision(b, liveTitle, "poster_vertical").allow, false);
    });
  });

  describe("Viewer & Investor permissions", () => {
    const title = makeTitle();
    it("viewer and investor have no asset visibility, preview, download, or upload", () => {
      for (const actor of [viewer(), investor()]) {
        for (const kind of ["master", "screener", "poster_vertical", "subtitle", "censor_certificate"]) {
          assert.equal(assetVisibilityDecision(actor, title, kind).allow, false);
          assert.equal(assetPreviewDecision(actor, title, kind).allow, false);
          assert.equal(assetDownloadDecision(actor, title, kind).allow, false);
          assert.equal(assetUploadDecision(actor, title, kind).allow, false);
        }
      }
    });
  });

  describe("Unverified / Unauthorized actor", () => {
    const title = makeTitle();
    it("unverified email is denied all operations", () => {
      const unverified = unverifiedOwner();
      assert.equal(assetVisibilityDecision(unverified, title, "master").allow, false);
      assert.equal(assetPreviewDecision(unverified, title, "master").allow, false);
      assert.equal(assetDownloadDecision(unverified, title, "master").allow, false);
      assert.equal(assetUploadDecision(unverified, title, "master").allow, false);
    });
  });

  describe("getAssetPermissions helper", () => {
    it("returns correct aggregated permissions for QC Reviewer on master", () => {
      const perms = getAssetPermissions(qcReviewer(), makeTitle(), "master");
      assert.deepEqual(perms, {
        canView: true,
        canPreview: true,
        canDownload: false,
        canUpload: false,
        canReplace: false,
        canDelete: false,
      });
    });

    it("returns correct aggregated permissions for Studio Owner on master in PREPARING", () => {
      const perms = getAssetPermissions(studioOwner(), makeTitle({ ownerUserId: "owner-studio-1", status: "PREPARING" }), "master");
      assert.deepEqual(perms, {
        canView: true,
        canPreview: true,
        canDownload: true,
        canUpload: true,
        canReplace: true,
        canDelete: true,
      });
    });
  });
});
