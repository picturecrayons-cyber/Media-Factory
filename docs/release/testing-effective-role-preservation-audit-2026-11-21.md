# Testing DB effective-role and preservation audit — 2026-11-21

## Scope and safety

- **STAGING / Testing DB:** Supabase project `jbymleftneggcgutlcqu`.
- **Action:** READ-ONLY catalog, effective privilege, RLS policy, function security, and Supabase security-advisor inspection.
- **Access:** STAGING READ-ONLY. Repository audit documentation WRITE only.
- **Risk:** no hosted schema/data changes; no migration applied; no production access or writes.
- **PRODUCTION DB:** `mlmgugivsyoxzdgwkbpu` remains **HOLD / NOT CERTIFIED / NO-GO**.

## Effective table privilege snapshot

The following values are from PostgreSQL `has_table_privilege`, catalog RLS flags, and policy counts. They are effective role privilege checks, not end-to-end API/JWT behavior tests.

| Table | RLS | Policies | anon SELECT/INSERT | authenticated SELECT/INSERT/UPDATE/DELETE | service_role |
|---|---:|---:|---|---|---|
| bridge_creator_documents | ON | 0 | denied | denied | SELECT/INSERT/UPDATE/DELETE |
| bridge_title_document_links | ON | 0 | denied | denied | SELECT/INSERT/UPDATE/DELETE |
| bridge_sublicense_authorizations | ON | 0 | denied | denied | SELECT/INSERT/UPDATE/DELETE |
| bridge_dit_ingest_sessions | ON | 0 | denied | denied | SELECT/INSERT/UPDATE/DELETE |
| bridge_dit_ingest_files | ON | 0 | denied | denied | SELECT/INSERT/UPDATE/DELETE |
| bridge_dit_copy_verifications | ON | 0 | denied | denied | SELECT/INSERT/UPDATE/DELETE |
| bridge_dit_storage_objects | ON + FORCE | 0 | denied | denied | SELECT/INSERT/UPDATE/DELETE |
| bridge_production_assets | ON | 4 | denied | granted (RLS owner policies) | SELECT/INSERT/UPDATE/DELETE |

For Creator Vault, Sublicensing, and DIT, zero client policies plus no anon/authenticated table privileges is consistent with a server-only data access design. It is not a substitute for testing actual server-action authorization and service-role call paths.

## Production Assets owner-policy review

The Testing DB has four `authenticated` policies on `bridge_production_assets`:

- SELECT: `private.bridge_is_title_owner(title_id)`
- INSERT: matching `WITH CHECK`
- UPDATE: matching `USING` and `WITH CHECK`
- DELETE: matching `USING`

The helper is `SECURITY DEFINER`, owned by postgres, with `search_path=pg_catalog` and `row_security=off`; it resolves the title owner through `bridge_loop_identity_links` and `auth.uid()`. Its private-schema EXECUTE grant is present for authenticated, while the public wrapper is not executable by authenticated/anon.

Catalog shape and role grants: **PASS**. Actual owner/non-owner/other-organization request behavior: **NOT VERIFIED**. A disposable local integration test must prove all four operations, including UPDATE re-parenting denial, using two distinct auth identities and titles.

## Security advisor findings

STAGING security advisor snapshot (observed 2026-11-21):

1. **23 `rls_enabled_no_policy` INFO findings.** This includes Creator Vault, Sublicensing, DIT, Studio scheduling/invites, and other server-only tables. The inspected target tables have no anon/authenticated table privileges; do not add broad policies simply to silence this lint. Review each finding against its intended server-only boundary.
2. **1 WARN — `public.has_active_loop_tvod_entitlement(text)` is SECURITY DEFINER and executable by authenticated.** This is a material exposed RPC risk requiring function-body and caller-intent review. Do not revoke/change it in hosted Testing until the public catalog/Loop playback call graph is reconciled and a replacement behavior is tested.
3. **1 WARN — leaked password protection disabled.** Configuration-only finding; no change made.

## Test coverage gap

Existing repository tests inspected:

- `src/lib/bridge/creator-documents.test.ts`: pure application owner-scope helper tests; not Postgres RLS or service-action tests.
- `src/lib/bridge/sublicensing.test.ts`: pure business authorization guard tests; not DB permission tests.
- `src/lib/bridge/dit-manifest.test.ts`: manifest normalization/checksum tests; not DIT row access tests.
- `scripts/supabase-migration-replay.test.mjs` / replay script: isolated local replay plus catalog/privilege assertions for Creator Vault/Sublicensing; no end-to-end owner/non-owner runtime matrix for Production Assets or DIT.

Therefore current evidence supports catalog-level access posture only. The following remain **NOT VERIFIED** until disposable local Postgres tests execute with real role/JWT context and seeded throwaway identities:

- Creator A cannot read/update/delete Creator B's vault documents; Studio member can access only the matching active organization; cross-org denied.
- Creator/Studio/Buyer cannot invoke sublicensing writes; only authorized Bridge Super Admin server path with a title-specific sublicensable grant succeeds.
- Production Asset owner can perform allowed operations; non-owner and unrelated organization cannot read/write/delete; UPDATE cannot reassign title ownership.
- DIT ingest/session/files/copy-verification/storage objects are inaccessible to anon/authenticated and available only through the intended trusted server workflow; unauthorized organization/session IDs are rejected.
- No protected files, title records, rights decisions, or DIT evidence are modified or deleted by the tests.

## Status

- STAGING catalog and effective privilege snapshot: **PASS** (READ-ONLY).
- Creator Vault/Sublicensing/DIT client-role denial at table privilege layer: **PASS**.
- Production Assets owner-policy structure: **PASS** (catalog only).
- End-to-end effective-role regression matrix: **NOT VERIFIED**.
- Exposed SECURITY DEFINER entitlement RPC review: **BLOCKED / REQUIRES CALL-GRAPH REVIEW**.
- TVOD app compatibility: **FAIL** (existing source/schema/RPC mismatch remains).
- STAGING schema/migration parity: **NOT CERTIFIED**.
- PRODUCTION: **HOLD / NOT CERTIFIED / NO-GO**.

No hosted Testing writes, Production changes, merge, or deployment promotion were performed.
