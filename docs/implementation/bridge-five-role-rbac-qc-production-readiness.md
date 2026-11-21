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
