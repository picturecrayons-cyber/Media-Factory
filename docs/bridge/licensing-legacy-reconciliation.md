# Bridge licensing legacy-record reconciliation

## Current inventory (read-only observation)

- Production contains 9 DRAFT rights-grant rows across two titles and 0 legal-case rows.
- One title has 5 DRAFT rows under the same agreement reference and otherwise matching territory, language, media and window: 2 EXCLUSIVE and 3 NON_EXCLUSIVE. These terms conflict and cannot be auto-collapsed.
- The other title has 4 DRAFT rows in two repeated pairs. Each pair has matching terms/window, but the agreement references are unexecuted placeholder text with inconsistent capitalization.
- The existing Bridge Testing DB contains 0 rights-grant rows. It therefore has no legacy licensing records to reconcile.
- No production or staging rows were changed, deleted, copied, revoked or rewritten during this inventory.

## Non-destructive reconciliation procedure

1. Keep the current source guard active: repeated agreement references block new writes; conflicting exclusive windows block new grants.
2. Export a READ-ONLY snapshot from the source DB into an access-controlled review workspace. Do not commit raw records, personal identifiers or agreement files to Git.
3. For every agreement-reference group, compare the executed agreement, ownership-chain evidence, title, territory, language, exploitation media, term/window and commercial split.
4. A legal reviewer who is not the draft creator or evidence submitter records the evidence decision in the new checksum-bound evidence workflow.
5. Do not infer a canonical row from creation time or row order. Conflicting EXCLUSIVE/NON_EXCLUSIVE records require a documented legal decision.
6. Preserve every original grant row and its audit history. Any later status transition must be separately authorized, auditable and applied only to the approved non-production test copy first. No DELETE, cascade, silent merge or history rewrite.
7. Because Testing DB currently has no grants, do not copy Production records into it without a separately approved, scoped data-copy plan.

## Database protection

- STAGING DB: READ-ONLY. No migration apply or data write is authorized by this document.
- PRODUCTION DB: READ-ONLY / HOLD / NOT CERTIFIED / NO-GO.
- This document is a review procedure, not an execution authorization.
