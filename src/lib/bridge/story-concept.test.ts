import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canIntroduceStoryConceptToBuyers,
  hasCompleteRightsDeclaration,
  hasIndependentEditorialAndLegalApproval,
  type StoryConceptApprovalState,
} from "./story-concept.ts";

const complete: StoryConceptApprovalState = {
  rights_holder_name: "Original Author",
  rights_basis: "ORIGINAL_AUTHOR",
  third_party_materials_included: false,
  rights_declaration_accepted_at: "2026-11-20T00:00:00.000Z",
  editorial_status: "APPROVED",
  editorial_reviewed_by: "editor-1",
  legal_status: "APPROVED",
  legal_reviewed_by: "legal-2",
  fee_certified_at: "2026-11-20T00:00:00.000Z",
};

describe("Story / Concept release gates", () => {
  it("requires a complete accepted author rights declaration", () => {
    assert.equal(hasCompleteRightsDeclaration(complete), true);
    assert.equal(hasCompleteRightsDeclaration({ ...complete, rights_declaration_accepted_at: null }), false);
    assert.equal(hasCompleteRightsDeclaration({ ...complete, rights_holder_name: " " }), false);
    assert.equal(hasCompleteRightsDeclaration({ ...complete, rights_basis: null }), false);
    assert.equal(hasCompleteRightsDeclaration({ ...complete, third_party_materials_included: null }), false);
  });

  it("requires independent Editorial and Legal approvals from different reviewers", () => {
    assert.equal(hasIndependentEditorialAndLegalApproval(complete), true);
    assert.equal(hasIndependentEditorialAndLegalApproval({ ...complete, legal_status: "PENDING" }), false);
    assert.equal(hasIndependentEditorialAndLegalApproval({ ...complete, editorial_status: "REJECTED" }), false);
    assert.equal(hasIndependentEditorialAndLegalApproval({ ...complete, legal_reviewed_by: "editor-1" }), false);
    assert.equal(hasIndependentEditorialAndLegalApproval({ ...complete, legal_reviewed_by: null }), false);
    assert.equal(hasIndependentEditorialAndLegalApproval({ ...complete, rights_declaration_accepted_at: null }), false);
  });

  it("does not permit buyer introduction until both approvals and fee certification exist", () => {
    assert.equal(canIntroduceStoryConceptToBuyers(complete), true);
    assert.equal(canIntroduceStoryConceptToBuyers({ ...complete, fee_certified_at: null }), false);
    assert.equal(canIntroduceStoryConceptToBuyers({ ...complete, editorial_status: "NEEDS_INFO" }), false);
    assert.equal(canIntroduceStoryConceptToBuyers({ ...complete, legal_reviewed_by: "editor-1" }), false);
  });
});
