# Crayons LOOP Buyer — STAGING backend implementation boundary

**Status:** Draft implementation / not runtime-enabled  
**Production:** HOLD / NOT CERTIFIED / NO-GO  
**Tracking:** CRA-128, CRA-138, CRA-160, CRA-165, CRA-103, CRA-36

## Canonical architecture

Crayons Bridge remains the single authority for buyer identity, legal organization membership, commercial mandate, title rights, license scope, publication authorization and revocation. Crayons LOOP is a read-only delivery/consumer endpoint. This PR does not introduce a second title or rights authority.

The Loop Buyer is an application-level Bridge `buyer` principal bound to one canonical Bridge organization. It is not a Vercel team member and does not require a second Super Admin or shared admin credential. Keep the existing external account types; commercial capacity (buyer, distributor, aggregator, broadcaster, platform, ancillary licensee) is mandate data, not a new privileged account type.

## Implemented in this PR

- A pure server-side authorization policy contract at `src/lib/bridge/loop-buyer-access.ts`.
- The policy fails closed unless the principal is a verified `buyer`, the membership and organization are active, and the publication grant exactly matches the principal's organization and requested title.
- An explicit mandate contract is now required: rights-grant ID, mandate ID/status, rights-principal organization, transaction-buyer organization, explicit mandate validity window, and an ordered principal → intermediary(ies) → buyer chain.
- Every mandate-chain organization must be active and in-window; every non-final organization must have explicit onward-delegation authority. Cycles, missing links, over-delegation, inactive mandates and mismatched buyer organizations deny.
- Rights checks require territory, language, exploitation model, and an explicit valid rights start/end window.
- Revoked, pending, suspended, expired, malformed, missing and cross-organization grants are denied.
- Regression tests cover Buyer A/B isolation, identity/membership failures, missing or inactive mandates, expired mandate windows, broken/cyclic/delegation-invalid chains, title/territory/language/model mismatch, revocation and rights-window failures.
- The new tests are registered in the existing `npm test` script.

## Schema reconciliation — read-only STAGING / TESTING DB evidence (2026-11-03)

Target inspected: Supabase project `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB, ap-south-1). This is the existing Testing DB, **not** a proven dedicated Loop STAGING environment.

- The inspected public schema has 32 Bridge tables and no `loop_*` tables.
- `bridge_profiles` contains `account_type`, `email_verified`, and a display-only `organization_name`; it does not provide the canonical membership/mandate chain required here.
- `bridge_entitlements` contains `user_id`, `title_id`, `payment_id`, and `access_type`; it has no `organization_id`.
- `bridge_rights_grants` contains title, territory, language, media, rights-window, exclusivity, sublicensing, restrictions, evidence and status fields, but no buyer organization or mandate foreign key.
- The inspected schema did not expose the required canonical organization/membership relations or `bridge_loop_identity_links`.
- The only listed Supabase branch is `main`, reported as `MIGRATIONS_FAILED`; it is not accepted as an isolated Loop STAGING target.
- A separate dedicated Loop STAGING project could not be created under the current Free-plan two-active-project limit without pausing/deleting an existing project or upgrading. Neither action is authorized or was taken.

**Important mapping rule:** do not infer that `bridge_rights_grants.media` is equivalent to Loop exploitation models. Do not infer a buyer organization from `bridge_profiles.organization_name`, email, or browser input. Do not fabricate a mandate, identity link, rights grant, or entitlement. The new mandate-chain type is a code-level contract only; it is not yet backed by persisted canonical schema.

## Not implemented / intentionally gated

This is not yet connected to the live Bridge session resolver, canonical organization/membership/mandate persistence, DB queries, Loop catalog API, title details, playback authorization, signed assets, publication webhook, or revocation worker. Wiring the policy into runtime before the canonical organization/mandate schema and database isolation are available would risk breaking existing accounts/flows or accidentally falling back to Production.

No database migration is included in this PR. A migration must be generated with Supabase CLI only after the canonical schema and dependencies are reviewed; do not invent a migration filename. Do not apply a migration from this PR.

## Required next implementation slice after isolated STAGING is proven

1. Resolve the existing verified Bridge principal through the canonical immutable Auth subject or an explicit verified identity link. Remove email-only identity inference only through a compatibility-reviewed change that preserves existing account access; unresolved or ambiguous identity must deny protected Buyer access.
2. Reconcile canonical legal organization, active membership, rights principal, transaction counterparty, intermediary mandate chain and licensee binding. Do not create a second identity or infer organization scope from a display name.
3. Compare the existing rights-grant and publication models. Add only the minimum additive foreign keys/relations needed if no existing canonical relation can represent the legal licensee/mandate. Keep rights authority in Bridge.
4. Bind orders, payments, packages, entitlements and delivery records to the exact acting user, buyer organization, title, rights grant/package and mandate. Route payment/webhook fulfillment through one idempotent canonical writer; do not test with real payments.
5. Enforce the policy at server-side catalog, title-detail, playback, signed-asset and publication/revocation boundaries. Never rely on UI filtering.
6. Ensure catalog output contains only approved consumer metadata and authorized public playback references. Do not return QC, legal, contracts, rights evidence, internal finance, master object keys or private operational metadata.
7. Add Buyer A/B, Distributor A/B, Aggregator A/B, wrong-title, wrong-territory, wrong-language, wrong-platform/model, mandate overreach, before-start, after-end, revoked, expired, suspended-membership, missing-grant and webhook replay/concurrency tests.
8. Verify table/column grants, RLS policies, PUBLIC/inherited role access, sequences/default ACLs, SECURITY DEFINER functions and storage policies. Run Supabase advisors.
9. Verify synthetic Preview E2E against isolated STAGING database and private storage only after separate approval. Production must never be a fallback.

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
| CRA-128 | Dedicated non-production DB and private storage; exact Preview env target verified; no Production fallback |
| CRA-138 | Canonical organization/membership/licensee/mandate schema and ordered additive migration + rollback reviewed |
| CRA-160 / CRA-165 | Rights principal, transaction counterparty and intermediary authority chain proven; Buyer/Distributor/Aggregator isolation |
| Backend | Exact Bridge principal and organization-scoped authorization at every read/playback boundary |
| Rights | Territory/language/platform/model/window/revocation and mandate delegation enforced server-side |
| Regression | Existing creator/studio/internal reviewer/QC/legal/payment flows remain unchanged |
| CI | Exact PR head passes typecheck, lint, tests, secret scan, build and PostgreSQL workflow |
| Runtime | Synthetic STAGING E2E passes after isolation and separate runtime approval; no real payment/email |

A passing CI or Vercel READY state alone is not certification. No merge or Production promotion is authorized by this PR.
