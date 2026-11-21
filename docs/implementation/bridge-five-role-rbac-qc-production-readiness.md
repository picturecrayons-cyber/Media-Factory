# Crayons Bridge — Five-role RBAC and QC implementation baseline

Tracking issue: #758

This is an implementation control document, not a certification. Production remains HOLD / NOT CERTIFIED / NO-GO.

## Scope
- Super Admin: protected cross-account operations and audited approvals.
- Creator: own-title, own-asset, rights evidence and correction workflows.
- Studio: organization/member RBAC, production slate, schedule, QC/rights progress and statements.
- Buyer: explicit buyer-title access, cleared catalogue, secure preview and commercial workflow.
- Investor: explicitly assigned title participation, read-only finance and settlement visibility.
- QC: server-authoritative submission preflight, idempotency, atomic lifecycle/audit, reviewer queue, decision and acknowledgement.

## Existing implementation findings
- The current title action in `src/components/bridge/workflow-desk.tsx` calls `advanceTitle`; `src/lib/bridge/titles.ts` dispatches `QC_REVIEW` to `submitTitleForQc`.
- The core QC lifecycle transaction exists. This does not by itself certify asset readiness, notifications, acknowledgement, retry safety, reviewer queue behavior or end-to-end runtime.
- `src/routes/studio.tsx` still advertises Members & Roles, Productions, Schedule, Statements and Insights as not connected.
- Existing feature work must be reconciled rather than duplicated: PRs #304, #463, #557, #669, #699, #712, #723, #725 and #468.

## Implementation sequence
1. Freeze a route → server action → permission → table/storage access inventory.
2. Define a single authoritative permission matrix and cross-role deny tests.
3. Complete organization-scoped Studio membership and title access.
4. Complete Creator ownership and asset/document access.
5. Complete Buyer title-level access and Investor assignment-only read access.
6. Complete Super Admin operations with explicit privileged action audit.
7. Complete QC submit preflight, idempotency, reviewer queue, findings, decisions, notifications and acknowledgement.
8. Reconcile database RLS, effective grants, functions, storage policies and response DTOs object-by-object.
9. Run exact-head CI and authenticated Preview end-to-end tests.
10. Independent review before any release decision.

## Required safety labels
Every database task must state:
- Target: STAGING / Testing DB or PRODUCTION DB.
- Action: exact operation.
- Access: READ-ONLY or WRITE.
- Risk: Low / Medium / High with rationale.

### STAGING / Testing DB
Project: `jbymleftneggcgutlcqu`
Initial mode: READ-ONLY. Reconcile the existing migration ledger, schema, object ownership and effective grants before proposing any migration. No write until separately approved.

### PRODUCTION DB
Project: `mlmgugivsyoxzdgwkbpu`
Action: no mutation.
Access: READ-ONLY.
Risk: High if changed before independent certification.
Status: HOLD / NOT CERTIFIED / NO-GO.

## Release controls
- GitHub work stays on `feat/bridge-five-role-rbac-qc-production-readiness` and Draft PR.
- Vercel is Preview-only; verify that Preview points to the Testing DB before authenticated tests.
- No Production env changes, deploy promotion, merge, database migration/write, payment operation, customer email, or object-storage mutation.
- No paid upgrades; ₹0 additional spend.

## Acceptance evidence
For every gate record PASS / FAIL / BLOCKED / NOT VERIFIED, commit SHA, exact CI run, test evidence, environment and target, Action / Access / Risk, and residual limitations.

QC submission must never imply QC approval, rights approval, licensing, buyer entitlement or Crayons Loop publication. Bridge authorizes; Loop delivers. App-inu pani kittaruthu.


## Reconciliation update — 21 November 2026

The current `main` branch already contains the following foundations, so this implementation must extend them rather than replace them:

- Five requested dashboard identities map to four external account types (`independent_creator`, `studio`, `buyer`, `investor`) plus the verified internal `super_admin` role. Internal staff roles (`admin`, `qc_reviewer`, `legal_reviewer`, `finance`, `viewer`, and DIT) remain separate from account entitlements.
- Existing route foundations: `/creator`, `/studio`, `/buyer`, `/investor`, `/dashboard`; server-resolved `workspaceHome` and route gates are already present.
- Existing title operations: `WorkflowDesk` exposes Prepare, Business, Distribution and Revenue; server functions already gate lifecycle, rights, licensing, delivery and finance actions.
- Existing QC core: `submitTitleForQc` verifies the current master and artwork, locks the title, changes PREPARING → QC_REVIEW, and writes title-event/audit records transactionally. QC review/approval is a separate action and must remain separate.
- Existing investor dashboard reads only rows assigned to the authenticated investor. Buyer catalogue/payment/entitlement code is already separate from Creator/Studio title ownership.

### Existing PRs to reconcile (do not duplicate or blindly merge)

- Creator/Studio dashboard consolidation: #520, #590, #629; Studio operations increment #746.
- Super Admin control-centre/governance: #712, #731; existing Founder Centre simplification #725.
- Buyer operations: #751; Super Admin read-only Buyer inspection #710 and access fix #690.
- Asset authorization/preview: #304; seven-file QC readiness #491; portal boundaries #492.
- QC evidence and metadata gates: #424, #540; Admin certification workflow #675; title workspace/review controls #679.
- Internal role approval boundaries: #551 and #525. DIT least-privilege work #557.
- Studio/Creator evidence vault: #723.

These PRs are candidates for code/diff reconciliation. Their open/Draft status is not evidence of integration, test success, or runtime certification. The current branch does not cherry-pick them.

### QC submission notification increment on this branch

- After current asset verification and a locked PREPARING → QC_REVIEW transition, the same transaction now requires the notification outbox table and at least one email-verified `qc_reviewer`.
- A deduplicated pending outbox row is inserted per reviewer; if the outbox schema or a verified reviewer is missing, the transaction fails and the lifecycle/audit changes roll back.
- This change queues internal QC email notifications only. It does not send customer email or invoke SMTP. Outbox dispatch/retry operations, exact Testing migration reconciliation, and end-to-end Preview delivery remain separate NOT VERIFIED gates.
- An isolated PostgreSQL/PGlite regression assertion checks that the submission queues the notification. Exact-head CI has not yet reported a result for the latest commit.


## PR review and reconciliation evidence — 21 November 2026

### PR #759 review
- PR #759 remains Draft, open and unmerged. Current head at review: `47eff0c3615289242056b9af149afc6d3e2984b5`.
- Exact-head CI run `44862423582`: gate, PostgreSQL workflow tests and isolated Supabase migration replay all completed **PASS**. The gate ran build, typecheck, targeted ESLint, unit tests, secret scan and legacy dump guard. This is code/isolated replay evidence only, not a production certification or authenticated Preview test.
- The outbox enqueue code's column names match the existing outbox migration: `event_key`, `recipient_email`, `subject`, `text_body`, `html_body`. The production schema also has attempts, next-attempt scheduling, processing lease, provider message ID and sent timestamp fields. The production outbox migration revokes all client grants and enables RLS.
- `bridge_profiles` in Production has `user_id`, `email`, `internal_role`, and `email_verified`; the enqueue query's selected columns exist. This is a read-only schema match, not evidence that a live QC submission is safe to execute.
- The current event key embeds a wall-clock timestamp. Keep a follow-up idempotency review open: use a stable persisted submission/event identifier where available, and prove duplicate request/retry behavior rather than relying only on a title status transition.

### Existing PR disposition
- #491 (seven-file QC and multipart cleanup) is based on `feat/bridge-server-authoritative-multipart-20261106`, not `main`; it is not a safe direct merge into #759. Its server-side QC readiness helper and its caller must be ported/rebased as a coherent change after checking all dependencies. Its multipart cleanup is storage-mutating behavior and requires isolated tests; no real storage operation is authorized here.
- #746 (Studio schedule, membership, statements and financial activity), #712 (Super Admin governance/control centre) and #751 (Buyer operations workspace) each target `main` and remain Draft. They are mergeable at GitHub metadata level, but this is not a code-review or test pass. Their changed-file sets overlap shared route/shell/route-tree surfaces; integrate selectively after conflict and authorization review, not by blind merge.
- #746 carries pending migration files in `docs/pending-migrations`; those are not applied migrations.
- The current #759 branch still does not contain the functional Studio/Super Admin/Buyer dashboard implementations from those PRs. Their existence must not be described as integrated.

### Production RBAC read-only audit
Target: **PRODUCTION DB** `mlmgugivsyoxzdgwkbpu`.
Action: inspect schema, migration ledger, RLS policies, grants and Supabase security advisors.
Access: **READ-ONLY**.
Risk: **High** for any unreviewed write because the database is live.

- The production migration ledger contains the outbox migration `20261114135443_bridge_notification_outbox_20261114` and later Studio, DIT, private-storage, identity-helper, Loop publication and title metadata migrations.
- All inspected public tables have RLS enabled. The advisor reports 27 RLS-enabled tables with no policies; this may be intentional for server-only tables when client grants are absent, so it must be reconciled table-by-table against effective grants and server access paths.
- Relevant grants inspected: `bridge_profiles` and `bridge_buyer_title_access` expose SELECT to authenticated; the outbox, organizations, memberships and investor assignments show service_role grants, with no anon/authenticated table grants in the inspected grant rows.
- The advisor reports `public.bridge_is_title_owner(text)` as SECURITY DEFINER and executable by authenticated. It is referenced by existing RLS policies, so revoking or replacing it without migrating every dependent policy and testing would risk breaking title/asset operations. No change was made.
- Leaked-password protection is disabled. This is an Auth configuration hardening item, not a reason to mutate SQL grants or rewrite role policies.
- No Production grants, policies, functions, Auth settings, migrations, data or environment variables were changed.

### Remaining acceptance gates
1. Port the seven-file readiness helper and finished-film metadata/rightsholder checks into the server-authoritative QC transition, then test missing, stale, mismatched and unverified assets.
2. Implement an internal-only outbox dispatcher with bounded retries, lease recovery, dead-letter/terminal failure, provider idempotency and audit trail. Keep sending disabled until a separate operational approval and provider configuration review.
3. Port and reconcile #746, #712 and #751 selectively; test all role/action combinations and negative cross-user/cross-organization access.
4. Reconcile the Testing DB ledger/schema/grants read-only, then request a separate narrowly scoped write approval only if drift requires it.
5. Verify authenticated Bridge Preview and confirm its database URL/key target before any end-to-end test.

No merge, production write, production environment change, storage mutation, live email or payment operation was performed. Production remains HOLD / NOT CERTIFIED / NO-GO.


## Implementation update — 21 November 2026 (QC submission hardening)

Target: **PRODUCTION DB** `mlmgugivsyoxzdgwkbpu` and **STAGING / Testing DB** `jbymleftneggcgutlcqu`.

- **PRODUCTION DB** — Action: verify existing notification outbox migration only. Access: **READ-ONLY**. Risk: **High** for any write. The migration `20261114135443_bridge_notification_outbox_20261114` is already present in the ledger and the table exists with RLS enabled. No duplicate migration or Production write was performed.
- **STAGING / Testing DB** — Action: compare migration ledger and outbox table presence. Access: **READ-ONLY**. Risk: **Medium**. The Testing ledger contains 68 migrations and the QC outbox table was absent at audit time. No migration was applied; the previously discussed staging-only write has not been authorized in this message.
- PR #759 now validates the seven required QC assets inside the lifecycle transaction: master, trailer, vertical poster, horizontal artwork, thumbnail, subtitles and censor/legal certificate. Each requires a positive byte size, immutable verified object key, complete storage provenance, verification timestamp and 64-character SHA-256 checksum. The master and vertical poster must match the title's current master/artwork pointers.
- Finished-film metadata and rights-holder classification/authorization evidence are validated before PREPARING → QC_REVIEW. Title and existing asset rows are locked before validation; lifecycle, audit and queued internal notifications commit atomically.
- Notification idempotency now derives from the persisted `bridge_title_events.id`, not a wall-clock timestamp. The application URL comes from the approved Bridge origin resolver.
- Test fixture now models the required metadata, seven immutable asset rows, rights declaration and reviewer. Exact-head CI is currently **IN PROGRESS** on `b0d054c5a86f7de0a7072ba8157c5ff97590b660`; do not report PASS until the workflow run completes.
- Reviewer lookup still selects all verified `qc_reviewer` profiles. A title/organization-specific QC assignment schema does not currently exist in the inspected Production table inventory. This remains a scope/assignment design gate; do not invent an assignment join.
- Dispatcher implementation, bounded retries/lease recovery/provider idempotency, and selective functional port of #746/#712/#751 remain **NOT VERIFIED / NOT IMPLEMENTED** on this head. Existing `mail.server.ts` SMTP helper is not a bounded outbox dispatcher. Sending remains disabled pending a separately reviewed provider/idempotency design.
- Seven-file multipart cleanup from #491 is deliberately not ported in this increment: it performs real OCI abort and manifest deletion operations. Keep it isolated until its tests and concurrency behavior are independently reviewed.
- PR #759 remains Draft, open and unmerged. No Production SQL, grant, policy, Auth setting, environment variable, storage object, customer email, payment, merge or deployment promotion was performed.


## Owner submission, legal consent and review queue increment — 21 November 2026

Target environments:
- **PRODUCTION DB** `mlmgugivsyoxzdgwkbpu` — Action: inspect title/asset/legal/outbox/revenue schema and rows. Access: **READ-ONLY**. Risk: **High** for any mutation.
- **STAGING / Testing DB** `jbymleftneggcgutlcqu` — Action: inspect migration/schema presence. Access: **READ-ONLY**. Risk: **Medium**.

### Implemented in PR #759 (code only; no DB migration applied)
- Owner title page now displays a compact completion panel for missing release year, runtime, country, release date, original language and synopsis. It does not ask the owner to re-enter fields already present.
- The existing legal Terms page now includes a versioned Title Submission & Rights Declaration (`bridge-title-rights-v1`). The QC submit action requires the authenticated Creator/Studio submitter to open and accept the declaration; server-side validation rejects a missing or stale consent version.
- A new server-only migration creates `bridge_title_submission_consents`, recording title, submission event, submitter account and accepted version/timestamp. RLS is enabled and browser roles receive no direct table privileges.
- Submission checks the owner identity or active membership in the owning Studio; a generic internal Viewer or Buyer cannot submit/accept for the owner.
- A pending `bridge_qc_cases` record, lifecycle event, audit entry, consent record and per-reviewer outbox notifications are written in the same transaction.
- The internal operations desk now exposes a New Title Submissions queue for titles in `QC_REVIEW`. QC decision remains independent of submission.

### Production schema reconciliation that changed the implementation
- **PRODUCTION DB** contains `bridge_asset_versions` with SHA-256, byte size, processing state and JSON technical metadata. `bridge_assets` itself does **not** contain the checksum/provenance columns assumed by an earlier branch draft. The QC submission query has been corrected to read verification evidence from the canonical asset-version table rather than selecting nonexistent `bridge_assets` columns.
- For `Pranayam 1947`, the inspected Production database has zero `bridge_asset_versions` rows and zero `bridge_dit_storage_objects` rows. The visible `bridge_assets` records include duplicate/stale rows and do not prove SHA-256 integrity. Therefore the seven-file UI count is not sufficient evidence for QC. The server gate will fail closed until each current asset has a PASSED asset-version record with matching byte size, SHA-256 and OCI provenance in `technical_metadata`.
- The `bridge_title_submission_consents` table is absent from both Production and Testing DB. The migration is committed to this PR only and has not been applied to either database.
- The Production QC notification outbox exists; Testing DB outbox table is absent. No dispatcher was started and no email was sent.
- The reported `loop_tvod_payment_events` runtime error remains unresolved. The current branch's Bridge revenue query uses the existing `loop_payment_events` relation; the error source was not located in this branch or the read-only schema inspection. Do not mark revenue fixed until the exact runtime caller is traced.

### Remaining NOT VERIFIED / NOT IMPLEMENTED
1. Add trusted SHA-256 creation and OCI provenance persistence to the asset-confirmation path, with safe re-verification for legacy assets. Do not use ETag as SHA-256.
2. Test the new legal-consent migration in isolated CI and then on STAGING only after a separate STAGING WRITE approval. Do not apply it to Production as part of this PR.
3. Implement an outbox worker with bounded retries, stale-lease recovery, terminal failure handling and a provider that supports true idempotency. Current SMTP transport has no provider idempotency guarantee; deterministic Message-ID alone is not sufficient. Sending remains disabled.
4. Continue selective integration of #746, #712 and #751 after schema and RBAC review. No blind merges.
5. Complete five-role negative tests and authenticated cross-organization Preview tests.

PR #759 remains Draft, open and unmerged. Vercel work is Preview-only. No Production SQL, migration, grant, RLS, Auth, environment, storage, payment, customer-email, merge or promotion operation was performed. Production remains **HOLD / NOT CERTIFIED / NO-GO**.
