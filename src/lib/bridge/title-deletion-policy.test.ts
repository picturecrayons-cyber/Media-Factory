import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PERMANENT_TITLE_DELETION_DISABLED_MESSAGE,
  DRAFT_TITLE_REMOVAL_DISABLED_MESSAGE,
  canRemoveDraft,
  rejectPermanentTitleDeletion,
} from "./title-deletion-policy.ts";

describe("draft removal policy", () => {
  const cleanDraft = {
    status: "DRAFT",
    hasAssets: false,
    hasQcCase: false,
    hasLegalCase: false,
    hasRightsGrant: false,
    hasPayment: false,
    hasSubmission: false,
  };

  it("allows removal only for an untouched DRAFT", () => {
    assert.equal(canRemoveDraft(cleanDraft), true);
  });

  it("rejects prepared or later-stage records", () => {
    for (const status of ["UPLOADING", "PREPARING", "QC_REVIEW", "RIGHTS_REVIEW", "LICENSING_READY", "LIVE_FOR_BUYERS"]) {
      assert.equal(canRemoveDraft({ ...cleanDraft, status }), false);
    }
  });

  it("rejects a draft with any linked operational evidence", () => {
    for (const key of ["hasAssets", "hasQcCase", "hasLegalCase", "hasRightsGrant", "hasPayment", "hasSubmission"] as const) {
      assert.equal(canRemoveDraft({ ...cleanDraft, [key]: true }), false);
    }
  });

  it("keeps permanent deletion disabled", () => {
    assert.throws(() => rejectPermanentTitleDeletion(), {
      message: PERMANENT_TITLE_DELETION_DISABLED_MESSAGE,
    });
  });
});
