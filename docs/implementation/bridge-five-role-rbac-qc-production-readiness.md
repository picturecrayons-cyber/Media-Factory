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
