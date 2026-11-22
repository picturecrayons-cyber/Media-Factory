# Owner Submission Lifecycle — Implementation Contract

## Scope
Implement one complete Creator/Studio → Super Admin intake workflow using canonical Bridge records:
- Finished Films: `bridge_title_owner_submissions` linked to `bridge_titles`.
- Story / Concepts: `bridge_story_concept_submissions` linked to `bridge_titles`.

This is separate from PR #775's read-only Founder Submission Inbox.

## Owner experience
- Show an explicit **Submit to Super Admin** action on eligible Finished Film and Story / Concept title records.
- Resolve the verified actor server-side and confirm title ownership or active Studio organization membership. Never trust client-provided owner IDs or roles.
- After submit, show **Submitted / Pending Review** and submitted time.
- If Super Admin requests changes, show the reason and a **Resubmit** action.
- Resubmission must preserve previous decisions and notes in history.

## Super Admin experience
- Add **Incoming Owner Submissions** under Admin → Operations, alongside existing Needs Attention.
- Keep Finished Films and Story / Concepts visually separate.
- Show title, owner/studio, category, submitted timestamp, Document Vault attachment count, state, and direct title workspace link.
- Only a verified actor whose server-resolved internal role is exactly `super_admin` may list or act on this queue.
- **Accept into Intake / QC** acknowledges the owner package only. It must not change title lifecycle status to `QC_REVIEW`, create a QC PASS, approve rights/legal, set `LICENSING_READY` or `LIVE_FOR_BUYERS`, create entitlements, or publish to Loop. A separate authorized QC submission/review path remains responsible for QC entry.
- **Request Changes** requires a non-empty bounded reason note, returns the item to the owner, and exposes that note to verified owner/studio members.
- Enforce transitions server-side and use row locks/transactions to prevent duplicate or stale decisions.

## Audit and history
- Every submit, resubmit, accept, and request-changes event records actor, action, timestamp, entity, reason/note, and prior/new submission state.
- Write audit entries in the same database transaction as state mutations where possible.
- Never update or delete prior audit records. Use existing transaction-aware audit/event tables.

## Data and integration rules
- Reuse canonical Finished Film and Story / Concept records. Do not create a competing title table or shadow submission system.
- Confirm Testing schema and constraints before adding migrations. Any migration must be additive, forward-only, and limited to Testing project `jbymleftneggcgutlcqu`.
- Production project `mlmgugivsyoxzdgwkbpu` is strictly read-only. No Production SQL, migrations, data edits, or deployment promotion.
- No secret changes, no RLS weakening, no service-role credentials in client code, no permissive policies to satisfy lints.
- Use synthetic test titles only. Never use or mutate `Jananam 1947 Pranayam Thudarunnu` or any real Production title.

## Security tests
- Verified Creator owning the title can submit and see only their own status/reason.
- Verified active Studio member can submit only within their active organization; inactive/unrelated members are denied.
- Buyer, anonymous, unverified, and ordinary internal roles cannot submit or read/act on the Super Admin queue.
- Only verified Super Admin can list, accept, or request changes.
- Missing Request Changes reason is rejected.
- Duplicate, stale, and invalid transitions are rejected.
- Acceptance leaves QC, rights/legal, licensing, buyer visibility, payment/entitlement, and Loop publication states unchanged.
- Request Changes note is owner-visible; resubmission preserves history.

## Release gates
- Keep PR Draft and Production HOLD / NOT CERTIFIED.
- Require exact-head CI/typecheck/lint/tests, Testing-only Preview DB binding, authenticated role/tenant isolation tests, migration review, and independent code review.
- Creating this contract alone is not implementation completion or production certification.
