# STAGING RLS / grants migration decision — NO WRITE REQUIRED ON CURRENT EVIDENCE

Target: **STAGING DB only** — Supabase project `jbymleftneggcgutlcqu`, Crayons Projects - Testing DB, ap-south-1.

Action: READ-ONLY verification.
Access: READ-ONLY.
Risk: Sensitive rights and settlement data; preserve fail-closed behavior.

## Tables reviewed

- `public.bridge_rights_evidence`
- `public.bridge_rights_evidence_reviews`
- `public.bridge_settlement_reference_claims`
- `public.bridge_settlement_reference_claim_events`

## Live STAGING evidence (2026-11-11)

- RLS is enabled on all four tables.
- No RLS policies exist on these four tables.
- `anon` and `authenticated` have no table grants on any of these four tables.
- `service_role` and `postgres` have the table privileges required by server-side operations.
- Constraints bind rights evidence to Bridge title, rights grant and asset-version records; review rows bind to evidence; settlement events bind to claim and source audit event.
- The Bridge application database access uses the server-only `getSql()` Postgres connection. It does not query these tables directly from browser Supabase Data API in the inspected path.

## Decision

**Do not add blanket authenticated RLS policies. Do not grant anon/authenticated access. Do not apply a migration for these four tables on the evidence currently available.**

RLS enabled + no policies + no anon/authenticated grants is a fail-closed, server-only access posture. The Supabase `rls_enabled_no_policy` advisor finding is informational for these four tables, not a reason to expose rows. The advisor's leaked-password protection warning is a separate Auth configuration issue and is not modified in this migration plan.

## Verification required after any future schema or app change

Run READ-ONLY checks confirming:
1. `relrowsecurity = true` for all four tables.
2. No `anon` or `authenticated` SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grants.
3. No unexpected policies or public RPC functions grant access.
4. The server-side Postgres connection still has the intended access.
5. Application-level tests cover Creator, Studio, legal reviewer and finance reviewer flows without direct browser table access.

If the product later requires a direct Data API surface, design a separate per-operation policy from verified identity and ownership semantics; that is a new security design and requires explicit review.

## Execution boundary

No SQL migration has been applied. No STAGING writes have occurred. PRODUCTION project `mlmgugivsyoxzdgwkbpu` is excluded and remains HOLD / NOT CERTIFIED / NO-GO.
