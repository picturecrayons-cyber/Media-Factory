# Crayons Bridge + Loop Super Admin Control Center — Audit & Gap Matrix
Date: 2026-10-12
Repository: `picturecrayons-cyber/Media-Factory`
Audit base: `5272514c4e853bd1ea89644b95a0150947545c65`
Implementation branch: `feat/super-admin-control-center-p0-20261012`

## Safety boundary
This is a read-only audit plus a small dashboard error-state change. No SQL DDL, migration application/reconciliation, production configuration change, DNS change, cloud resource creation, OCI key/IAM change, payment charge, deployment promotion, or production release was performed. PR #218 remains dedicated to OCI diagnostics. Production remains HOLD.

## Current evidence
- Shared Supabase project `mlmgugivsyoxzdgwkbpu` reports `ACTIVE_HEALTHY`.
- Existing tables include `bridge_profiles`, `bridge_invites`, `bridge_audit_logs`, `bridge_qc_cases`, `bridge_legal_cases`, `bridge_rights_grants`, `bridge_loop_publications`, `bridge_creator_notifications`, `loop_payment_events`, and `loop_user_tvod_entitlements`.
- Existing dashboard is protected by `RequireBridge allow="super_admin"` and calls server-backed `getDashboardSession()`; RBAC is defined in `src/lib/bridge/rbac.ts` and session/profile resolution in `src/lib/bridge/session.ts`.
- Dashboard previously converted a missing title result into an empty array (`titlesQ.data?.titles ?? []`). This could display an empty state/zero metrics when the query had failed. The P0 branch now separates session loading, title loading, and title-query error/invalid payload.
- Read-only RLS policy inspection found self-select for profiles, internal-read for audit logs, client-deny policies for invites and creator notifications, and title-scoped SELECT policies for QC/legal/publication tables. Do not loosen RLS to make UI access work; privileged actions need server-side authorization.
- Vercel returned a READY Preview for the implementation commit `466aa85cf4f63f8ac50e633cb6ab2f3ea62a7fb2`; exact-commit CI was still `in_progress` at the time of this audit. Recheck both before calling this slice verified.
- Razorpay read-only records show a captured rental at ₹99 and multiple failed attempts associated with the same title. This is evidence of payment records only, not proof of the requested ₹79 price, signed webhook handling, entitlement correctness, or protected playback. Do not create a new charge to test.
- Hostinger Mail connector can access the configured mailbox `abijithasokan@crayonspictures.com`; no test email was sent and Supabase SMTP/reset/confirmation delivery is not certified.

## Nine task groups
| # | Group | Current status | Gap / next evidence |
|---:|---|---|---|
| 1 | Current-state audit & gap matrix | In progress | Expand route/action inventory and test coverage; this document is the initial matrix. |
| 2 | Navigation & workflow design | Pending | Review all current routes, map roles to navigation, and produce a workflow diagram. |
| 3 | RBAC, permissions & protected routes | Partial existing implementation | Audit every server function/action and org-scope check; add deny/role-escalation/final-admin tests. |
| 4 | Dashboard real data/loading/error states | First small fix on branch | Add/verify tests; audit KPI provenance and stale/empty states; do not label estimates as revenue. |
| 5 | User management, invitations & revocation | Schema exists; lifecycle unverified | Audit invite creation/acceptance/expiry/revoke and final active Super Admin protection. |
| 6 | Security & audit ledger | Table/policies exist; completeness unverified | Verify every privileged action is server-authorized and writes actor/action/target/outcome/correlation evidence. |
| 7 | QC, rights, licensing & Loop publication | Domain tables exist; end-to-end enforcement unverified | Verify state prerequisites, grant issue/revoke, and Loop fail-closed grant consumption. |
| 8 | Communication & Review Workspace | Generic case-thread/task schema not established in this inventory | Search all repo/storage/functions first; then propose the smallest compatible schema, without applying it. |
| 9 | Integrations, tests, CI, Preview & Draft PR | In progress / blocked by external gates | Exact-head CI and Preview verification; mail delivery proof; payment/webhook/entitlement/playback evidence; OCI round-trip remains blocked. |

## P0 implementation order
1. Finish route/action/schema inventory and permission enforcement map.
2. Add dashboard loading/error/empty/stale tests and verify KPI source semantics.
3. Audit invitation lifecycle and final-super-admin protection.
4. Verify audit coverage for privileged actions.
5. Keep communication schema as a proposal until existing storage/functions are fully searched and the migration is reviewed.

## Release status
- Verified: source inspection, shared project/table inventory, selected RLS policies, branch and Draft PR created, matching Vercel Preview reported READY.
- Not verified: full application test suite for this branch, all role/org isolation paths, invite lifecycle, communication workflow, real mail delivery, payment-to-entitlement-to-playback, and full CI completion.
- Blocked: OCI 401/PAR upload round-trip and migration-history discrepancy. No production promotion.
