# STAGING RLS / grants migration plan — NOT EXECUTED

Target: **STAGING DB only** — Supabase project `jbymleftneggcgutlcqu`, Crayons Projects - Testing DB, ap-south-1.

Action: READ-ONLY discovery and migration design.
Access: READ-ONLY now. A future reviewed migration will be WRITE and must be separately approved.
Risk: HIGH until row ownership, identity joins and role semantics are verified.

## Scope

RLS is enabled but no policies were found on:
- `public.bridge_rights_evidence`
- `public.bridge_rights_evidence_reviews`
- `public.bridge_settlement_reference_claims`
- `public.bridge_settlement_reference_claim_events`

## Required evidence before SQL is authored

- Full column definitions, primary/foreign keys, constraints, indexes, triggers and dependent views.
- All application queries and mutation paths for the four tables.
- Verified mapping from authenticated Supabase user to Bridge profile and organization membership.
- Explicit per-table/per-operation matrix for Creator, Studio, legal reviewer, finance, admin and super-admin.
- Current grants for anon/authenticated and function execute privileges.

## Policy design constraints

- No generic blanket `TO authenticated USING (true)` policy.
- No reliance on user-editable `user_metadata` for authorization.
- Creator/Studio access must be row-scoped to verified ownership/organization.
- Legal review and settlement evidence must be restricted to authorized internal roles.
- UPDATE requires both SELECT visibility and UPDATE `USING` + `WITH CHECK`.
- Revoke unnecessary grants and add only required privileges.
- Preserve auditability; do not allow a submitter to approve their own rights or settlement evidence.

## Test matrix

Test unauthenticated anon, unrelated authenticated account, owner Creator, same-org Studio member, other-org Studio member, legal reviewer, finance reviewer, admin and super-admin. Verify SELECT, INSERT, UPDATE, DELETE independently, including cross-row reassignment attempts.

## Execution boundary

No migration SQL is included because the correct ownership columns and identity joins must first be proven from the live STAGING schema and application access paths. Do not execute speculative policies. PRODUCTION project `mlmgugivsyoxzdgwkbpu` is excluded and remains HOLD / NOT CERTIFIED / NO-GO.
