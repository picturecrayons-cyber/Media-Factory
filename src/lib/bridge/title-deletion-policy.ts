export const PERMANENT_TITLE_DELETION_DISABLED_MESSAGE =
  "Permanent title deletion is disabled until the approved archive and restore workflow is implemented and verified.";

export function rejectPermanentTitleDeletion(): never {
  throw new Error(PERMANENT_TITLE_DELETION_DISABLED_MESSAGE);
}
