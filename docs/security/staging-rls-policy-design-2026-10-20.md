# Staging RLS policy design and validation gate

**Date:** 2026-10-20  
**Scope:** Crayons Bridge staging Supabase project `bbtrosuwisnxacuxvegt`; repository branch `audit/staging-rls-auth-2026-10-20`.  
**Release boundary:** Staging/Preview only. Do not merge, deploy Production, change Production data, or perform OCI recovery under this plan.

## Current verified state

- The staging lockdown migration `staging_public_rls_lockdown_20261020` is present in migration history.
- All previously RLS-disabled public tables are now RLS-enabled.
- The 21 previously broadly granted tables have no `anon`/`authenticated` table privileges; client access remains deliberately fail-closed.
- Six Bridge tables have SELECT policies already defined, but catalog inspection shows the authenticated role currently has no SELECT privilege on those tables either. RLS policy presence alone does not grant table access.
- Existing Bridge policy predicates call helper functions such as `bridge_can_read_title`, `bridge_current_user_id`, and `bridge_is_internal`. The repository's hardening migration revokes direct EXECUTE from `authenticated`. Before restoring table grants, verify the policy evaluation path: a policy helper must be executable in policy context without making a sensitive `SECURITY DEFINER` helper callable as an exposed RPC endpoint.
- The staging schema differs from at least one historical Loop schema reference (`loop_watchlist` exists here, while a prior live schema inspection referenced `loop_watchlists`). Do not apply Loop policies until the exact repository, schema and deployed API path are aligned.

## Policy matrix — proposals, not applied

| Table(s) | Intended client surface | Candidate rule / default |
|---|---|---|
| `titles` | Legacy catalog only if a current route is proven to query it directly | Prefer no direct grant; expose a narrow safe catalog view/RPC if required. Published/listed/status predicates must exclude revoked, unpublished and unlisted titles. Never expose storage keys or internal metadata. |
| `loop_titles` | Loop catalog only if this is the canonical deployed schema | Prefer a safe view/RPC returning allowlisted fields; include publication/listing/status gates. Keep playback paths and sensitive metadata server-authorized. Verify exact canonical table first. |
| `watchlist`, `loop_watchlist`, `loop_watch_progress` | Per-user personalization only if direct client calls are confirmed | Owner-only SELECT/INSERT/UPDATE/DELETE bound to trusted authenticated identity; INSERT `WITH CHECK`, UPDATE both `USING` and `WITH CHECK`; deny cross-user IDs. Resolve the app's user-ID mapping and singular/plural table mismatch before authoring policies. |
| `profiles`, `loop_profiles` | No direct browser access until identity and column needs are proven | Keep server-only by default. These schemas include sensitive profile/role fields (and legacy profile PIN); never expose PIN or let user-editable metadata determine staff privileges. If needed, create a safe profile view and owner-only update fields. |
| `submissions` | Submission intake/status, only if direct client access is proven | Prefer server-side submission endpoint with validated fields. If direct access is required, owner SELECT only; allow INSERT only through a constrained intake path; prevent clients changing moderation/status fields. |
| `screeners` | No direct browser table access | Server-only; token and watermark data are capability/security-sensitive. |
| `qc_jobs`, `loc_jobs`, `transfers` | No direct browser table access | Server-only operational workflows; staff actions must use server-side RBAC and audit checks. |
| `entitlements`, `loop_entitlements`, `subscriptions`, `loop_subscriptions` | Read-only self-service only if product flow requires it | Prefer server-authoritative reads. If direct reads are necessary, owner-bound SELECT only and a trusted finance/admin exception; clients must not create or update payment, subscription, or entitlement state. |
| `bridge_dmca_registrations` | No direct browser table access | Legal case data remains server-side; route all writes through validated, audited endpoints. |
| `revenue_events` | No direct browser table access | Finance/server-only, immutable event writes from trusted processing paths. |
| `config_revisions`, `platform_meta` | Unclassified; no client access until key/value sensitivity is reviewed | Keep server-only until each field is classified. For genuinely public settings, expose a narrow allowlisted view. |
| `territories` | Read-only reference data only if needed by the UI | If confirmed, grant SELECT only on enabled/public rows or a safe view; no client writes. |
| Six existing Bridge policy tables: `bridge_assets`, `bridge_audit_logs`, `bridge_entitlements`, `bridge_loop_publications`, `bridge_payments`, `bridge_title_events` | Existing owner/buyer/internal read policies | Do not grant access yet. First make policy helper execution safe and test each role. Never allow broad client writes to payment, audit, publication, or title-event tables. |

## Validation sequence

### 1. Main application journeys (must pass before policy restoration)

Run against the staging/Preview build connected to `bbtrosuwisnxacuxvegt`, with dedicated staging test accounts and non-production assets only:

1. Anonymous landing/onboarding and sign-in page loads.
2. Sign-in, persisted session restoration, protected-route redirect, sign-out and re-entry.
3. Creator: create/open own title, submit metadata, upload a harmless test asset, confirm metadata and asset read-back; verify another creator cannot see or mutate it.
4. Internal roles: admin title listing/detail, workstation page, role-gated actions; verify a non-staff user cannot reach staff data/actions.
5. Buyer/rights: title visibility respects status, publication/listing, rights/legal, QC and destination-delivery gates; revoked/unpublished records remain hidden.
6. QC/delivery: read-only status views work; do not trigger real QC, transfer, payment or OCI jobs.
7. Loop personalization, if part of this deployment: own watchlist/progress read/write and cross-user denial against the exact deployed Loop schema.
8. Confirm no console errors, unexpected 401/403/5xx responses, data leaks, or regressions. Capture request status and redacted response summaries, not tokens or personal data.

**Status:** not yet end-to-end validated in this run. The deployed URL was not accessible through the available page fetch, and authenticated browser execution would use a metered browser service. Earlier anonymous route smoke results are not evidence that the post-lockdown authenticated journeys work. Do not treat this gate as passed.

### 2. Policy tests before any client grants

Use an isolated staging branch/database or a rollback-only transaction with dedicated synthetic users. Do not use production or real payment/rights data.

For every candidate policy, test:
- anonymous: denied where intended;
- authenticated owner: only own permitted rows visible;
- unrelated authenticated user: zero rows and no mutation;
- internal roles: only the explicitly allowed role/action;
- revoked, unpublished, unlisted, expired and non-approved cases: denied;
- INSERT with forged owner ID: rejected;
- UPDATE attempting to transfer ownership or alter protected status: rejected by `WITH CHECK`;
- DELETE and bulk filters: denied unless explicitly required;
- service-role/server paths: expected behavior preserved, without exposing service credentials.

For the six Bridge tables, verify policy-helper calls do not fail due to EXECUTE ACLs. A safe approach is to move sensitive `SECURITY DEFINER` helpers into a non-exposed schema with fixed `search_path`, revoke EXECUTE from `PUBLIC`/`anon`, and grant only the minimum EXECUTE needed for policy evaluation to `authenticated`; confirm the schema is not exposed by the Data API. Alternatively rewrite policies to avoid public callable privileged helpers. Do not simply re-grant EXECUTE on the existing exposed public functions.

Run existing repository checks (`npm test`, `npm run typecheck`, `npm run check:auth`, and relevant workflow/RBAC tests) on the exact PR head, then re-run staging journeys and Supabase security advisors.

## Release gate

No client table grants or permissive policies are restored by this design document. First prove the current application journeys and establish which direct client paths actually exist. Restore only the minimum required table/column grants and policy combination, test positive and negative cases, and keep Production HOLD until separately authorized.
