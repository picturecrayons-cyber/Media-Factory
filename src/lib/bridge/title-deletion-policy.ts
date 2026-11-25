export const PERMANENT_TITLE_DELETION_DISABLED_MESSAGE =
  "Permanent title deletion is disabled until the approved archive and restore workflow is implemented and verified.";

export const DRAFT_TITLE_REMOVAL_DISABLED_MESSAGE =
  "Only a draft with no linked assets, review cases, rights, payments or submissions can be removed. This record is not eligible.";

export type DraftRemovalFacts = {
  status: string;
  hasAssets: boolean;
  hasQcCase: boolean;
  hasLegalCase: boolean;
  hasRightsGrant: boolean;
  hasPayment: boolean;
  hasSubmission: boolean;
};

export function canRemoveDraft(facts: DraftRemovalFacts): boolean {
  return facts.status === "DRAFT" &&
    !facts.hasAssets &&
    !facts.hasQcCase &&
    !facts.hasLegalCase &&
    !facts.hasRightsGrant &&
    !facts.hasPayment &&
    !facts.hasSubmission;
}

export function rejectPermanentTitleDeletion(): never {
  throw new Error(PERMANENT_TITLE_DELETION_DISABLED_MESSAGE);
}
