# Reversible archive and owner submission lifecycle repair

## Scope
Stacked on PR #778 at `43a913b6dfb8892e8142e23c4daa0beee9904a27`. This feature branch remains Draft and is not a release approval.

## Migration strategy
The Testing ledger has an entry named `20261122115243_bridge_title_draft_archive`, but its exact original SQL source was not recovered. This change does not rewrite that historical entry. It introduces a forward-only repair migration `20261122141000_reversible_archive_owner_submission_repair_20261122.sql`.

The migration:
- Adds `previous_status` to `bridge_titles`.
- Adds a strict archive metadata consistency check as NOT VALID so existing archived rows are not silently rewritten.
- Adds active/archive owner indexes.
- Extends the owner-submission state and append-only event action constraints with WITHDRAWN, REJECTED, ARCHIVED and RESTORED.
- Adds a separate append-only title archive event ledger with actor, actor role, organization, prior/new state, reason, request ID and timestamp.
- Keeps all database operations additive/forward-only; it contains no DELETE statements.

## Mandatory follow-up before apply
- Confirm the exact existing constraints and their definitions against the Testing catalog.
- Resolve any pre-existing rows that violate the new checks without rewriting history.
- Complete application-layer service and UI wiring.
- Complete disposable PostgreSQL replay and exact-head CI.
- Apply to Testing only after the migration has passed disposable replay and review.

## Guardrails
- Testing project: `jbymleftneggcgutlcqu` only.
- Production project `mlmgugivsyoxzdgwkbpu` remains read-only.
- Both Jananam title slugs remain protected.
- No Production migration, deployment, promotion, environment change, archive, or deletion.
- No permanent title or submission deletion.
- Preview E2E remains blocked until secure branch-scoped Testing DB credentials and test identities are configured directly in Vercel Settings.
