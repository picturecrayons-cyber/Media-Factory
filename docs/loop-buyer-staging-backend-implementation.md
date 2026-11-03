# Crayons LOOP Buyer — STAGING backend implementation boundary

**Status:** Draft implementation / not runtime-enabled  
**Production:** HOLD / NOT CERTIFIED / NO-GO  
**Tracking:** CRA-128, CRA-138, CRA-165, CRA-103, CRA-36

## Canonical architecture

Crayons Bridge remains the single authority for buyer identity, buyer organization membership, title rights, license scope, publication authorization and revocation. Crayons LOOP is a read-only delivery/consumer endpoint. This PR does not introduce a second title or rights authority.

The Loop Buyer is an application-level Bridge `buyer` principal bound to one canonical Bridge organization. It is not a Vercel team member and does not require a second Super Admin or shared admin credential.

## Implemented in this PR

- A pure server-side authorization policy contract at `src/lib/bridge/loop-buyer-access.ts`.
- The policy fails closed unless the principal is a verified `buyer`, the membership and organization are active, and the publication grant exactly matches the principal's organization and requested title.
- Rights checks require territory, language, exploitation model, and an explicit valid start/end window.
- Revoked, pending, suspended, expired, malformed, missing and cross-organization grants are denied.
- Regression tests cover Buyer A/B isolation, non-buyer/unverified identity, inactive membership/organization, title mismatch, territory/language/model mismatch, revocation and time-window failures.
- The new tests are registered in the existing `npm test` script.

## Not implemented / intentionally gated

This is not yet connected to the live Bridge session resolver, DB queries, Loop catalog API, playback authorization, publication webhook, or revocation worker. The current STAGING / TESTING DB `jbymleftneggcgutlcqu` has 32 Bridge tables and no `loop_*` tables; the current Preview environment does not prove a safe isolated backend. Wiring the policy into runtime before the canonical organization/mandate schema and database isolation are available would risk either breaking existing buyer flows or accidentally falling back to Production.

No database migration is included in this PR. A migration must be generated with Supabase CLI after the canonical schema and dependencies are reviewed; do not invent a migration filename. Do not apply a migration from this PR.

## Required next implementation slice after isolated STAGING is proven

1. Resolve the existing verified Bridge principal using server-owned identity/profile data only. Never authorize from `user_metadata`, email-domain heuristics, organization display names or browser-supplied account type.
2. Bind the dedicated Loop Buyer user to the existing canonical buyer organization and active membership. Do not create a duplicate Super Admin or an email-only fallback.
3. Extend the canonical Bridge publication/license grant with a buyer organization/mandate foreign key only if the existing canonical model cannot already represent the licensee. Keep buyer identity and rights-grant authority in Bridge.
4. Enforce the policy at server-side catalog, title-detail, playback, signed-asset and publication/revocation boundaries. Never rely on UI filtering.
5. Ensure catalog output contains only approved consumer metadata and authorized public playback references. Do not return QC, legal, contracts, rights evidence, internal finance, master object keys or private operational metadata.
6. Add Buyer A/B, wrong-title, wrong-territory, wrong-language, wrong-platform/model, before-start, after-end, revoked, expired, suspended-membership, missing-grant and replay/idempotency tests.
7. Verify all database tables are RLS-enabled and have deliberately scoped policies or server-only grants. Revoke direct browser access to sensitive grant/membership tables. Run Supabase advisors.
8. Verify synthetic Preview E2E against the isolated STAGING database and storage. Production must not be used as a fallback.

## Explicit non-actions

- No Supabase schema/data/Auth/RLS/ACL changes or migration application.
- No Buyer account creation, invitation, credential generation or seed.
- No Vercel environment variable change, deployment, domain promotion or merge.
- No Hostinger email send.
- No Razorpay order, payment, webhook replay or live transaction.
- No Production DB access/change and no title publication.

## Acceptance gates

| Gate | Required evidence |
|---|---|
| CRA-128 | Dedicated non-production DB and private storage; Preview env target verified; no Production fallback |
| CRA-138 | Canonical org/membership/licensee schema and migration order reviewed |
| Backend | Exact Bridge principal and organization-scoped authorization at every read/playback boundary |
| Isolation | Buyer A cannot read Buyer B's titles, entitlements, files or metadata |
| Rights | Territory/language/platform/model/window/revocation enforced server-side |
| Regression | Existing creator/studio/internal reviewer/QC/legal/payment flows remain unchanged |
| CI | Exact PR head passes typecheck, lint, tests, secret scan and build |
| Runtime | Synthetic STAGING E2E passes; no real payment/email |

A passing CI or Vercel READY state alone is not certification. No merge or Production promotion is authorized by this PR.
