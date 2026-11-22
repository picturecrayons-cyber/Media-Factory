import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PERMANENT_TITLE_DELETION_DISABLED_MESSAGE,
  canRemoveDraft,
  rejectPermanentTitleDeletion,
} from "./title-deletion-policy.ts";

describe("draft archive policy", () => {
  const cleanDraft = {
    status: "DRAFT",
    hasAssets: false,
    hasQcCase: false,
    hasLegalCase: false,
    hasRightsGrant: false,
    hasPayment: false,
    hasSubmission: false,
  };

  it("allows only untouched DRAFT records", () => {
    assert.equal(canRemoveDraft(cleanDraft), true);
  });

  it("blocks every prepared and later workflow state", () => {
    for (const status of ["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY", "LIVE_FOR_BUYERS", "IN_NEGOTIATION", "LICENSED", "DELIVERED"]) {
      assert.equal(canRemoveDraft({ ...cleanDraft, status }), false);
    }
  });

  it("blocks any draft with linked files, reviews, rights, payment or submission records", () => {
    for (const key of ["hasAssets", "hasQcCase", "hasLegalCase", "hasRightsGrant", "hasPayment", "hasSubmission"] as const) {
      assert.equal(canRemoveDraft({ ...cleanDraft, [key]: true }), false);
    }
  });

  it("keeps physical title deletion disabled", () => {
    assert.throws(() => rejectPermanentTitleDeletion(), {
      message: PERMANENT_TITLE_DELETION_DISABLED_MESSAGE,
    });
  });
});
