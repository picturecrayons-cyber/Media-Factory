# STAGING DB migration lineage and recovery plan — 2026-11-17

## Scope and environment separation

- **STAGING / Testing DB:** Supabase project `jbymleftneggcgutlcqu`, ap-south-1.
- **PRODUCTION DB:** Supabase project `mlmgugivsyoxzdgwkbpu`, ap-southeast-1.
- This document concerns STAGING only. Production remains READ-ONLY / HOLD.
- No database writes, migration repair, `db push`, migration application, or data export to a hosted third party is authorized by this proposal.

## Important correction: two different migration lineages

The repository's active `supabase/migrations/` directory contains 69 files and its README identifies them as the restored **Production** migration ledger source (2026-11-16). Those 69 files are not a one-to-one comparison set for the Testing DB ledger.

The STAGING database has a separate, test-specific migration history, including `test_only_*`, `*_testing`, and later Loop/Bridge staging migrations. Therefore, comparing only the counts (69 vs STAGING ledger count), or comparing unqualified filenames, does not establish migration drift or compatibility. The earlier shorthand statement that all Testing records were unmatched against the 69 Production files was too broad and is superseded by this distinction.

## Verified STAGING ledger observations

- A fresh READ-ONLY query on 2026-11-17 returned **56 records** from `supabase_migrations.schema_migrations`; this supersedes the earlier 55-record observation in this document's initial revision and in the PR's original description. A later same-day recheck still returned 56 rows but showed two additional latest records compared with the earlier inventory.
- Latest observed records in the recheck: `20261116224138 / loop_viewer_profiles_20261117` and `20261116224140 / loop_watchlists_20261117` (latest). The earlier `20261116210822 / bridge_title_hold_block_controls` was no longer the latest row.
- Every one of the 56 records has one stored `statements` array item and an empty `rollback` array (zero rollback entries).
- A metadata inventory was captured per row: version, name, statement count, byte length, MD5 fingerprint, and preliminary name/SQL-pattern triage class. This is not full SQL-content recovery or final security classification.
- The duplicate logical name `20261106_story_concept_buyer_mandates` appears at versions `20261106083617` and `20261106084908`.
- Their original SQL hashes differ:
  - `20261106083617`: `bb5ddd11b1cd5b612f41c65a2b80d4e38b2d940fe3c0bfbf8b26d2d0484e09bc`
  - `20261106084908`: `d601e65f862c72e9b7b19bed659fba102be643d65cbe9b4e09434fce9c78ccd1`
- After removing SQL comments and normalizing whitespace, both produce SHA-256 `c4dbf361f068591586dfde5e2c01d2bd95ff1e810d86d622fddb4279d61fe0f6`. The SQL operations are therefore equivalent under that normalization, but both historical ledger rows must be preserved.
- Zero rollback entries in the ledger do not prove that no recovery procedure exists elsewhere; they mean the ledger itself supplies no rollback statements.

## Required recovery procedure

1. Read the 56 STAGING rows in small batches, retaining each exact `version`, `name`, statement ordering, statement count, and rollback count.
2. Compute SHA-256 over the exact stored statement representation and separately over a documented normalized SQL representation. Never overwrite the original evidence with normalized text.
3. Classify each statement before putting it in source control: schema-only DDL, grants/policies/functions, deterministic reference data, environment-specific data, secrets, or unsafe/irreversible operation.
4. Exclude secrets, credentials, user data, payment payloads, production identifiers and any non-source runtime data. Stop if a row mixes source SQL with private data; redact only in a clearly marked derivative and preserve the original hash without publishing the raw payload.
5. Recover each approved source into a **non-active** STAGING recovery archive, keyed by both version and name. Do not place recovered Testing migrations in the active Production `supabase/migrations/` directory.
6. Reconcile the archive against the actual STAGING schema: tables, columns, constraints, indexes, triggers, functions, RLS, policies, grants, ownership and extension dependencies.
7. Prepare forward-fix and restore/recovery plans for every non-transactional or destructive operation. Do not infer rollback from an empty `rollback` array.
8. Run replay only against a fresh local disposable PostgreSQL/Supabase instance. Never point the replay runner at STAGING or PRODUCTION.
9. Request independent review and a separate, explicit STAGING WRITE approval before any hosted migration.

## Ledger freshness recheck — 2026-11-17

A further READ-ONLY query of all ledger metadata returned 56 rows, each with one statement item and zero rollback items. The latest two rows now observed are:

- `20261116224138 / loop_viewer_profiles_20261117` — 1 statement item, 0 rollback items, 1,704 statement bytes, MD5 `2f36c875d5efc3cef79269bc349f6e5b`.
- `20261116224140 / loop_watchlists_20261117` — 1 statement item, 0 rollback items, 1,310 statement bytes, MD5 `fc527f3c6f07593e070f488dde59dbc1`.

This recheck supersedes the earlier latest-version observation `20261116210822 / bridge_title_hold_block_controls`. The total remains 56 in the query result; source recovery and replay remain incomplete. These two latest SQL payloads still require the same exact-source, dependency, security and disposable-replay review as the other records.

## Follow-up READ-ONLY SQL command inventory — 2026-11-17

A later targeted pattern pass refined the preliminary DML counts. These are command-pattern candidates from stored SQL text, not a parser-certified AST inventory; comments and quoted/dynamic SQL still require manual/source-level review.

- **INSERT:** 11 command candidates across 7 migration records. Targets: `public.bridge_service_catalog`, `public.loop_payment_events`, `public.loop_user_tvod_entitlements`, `public.bridge_settlement_reference_claim_events`, `public.bridge_settlement_reference_claims`, `public.streamvista_projects`, `public.streamvista_service_orders`, `storage.buckets`, and `public.bridge_site_content`.
- **UPDATE:** 3 command candidates across 2 migration records:
  - `20261106031723 / bridge_server_authoritative_uploads_0023_20261106`: 1 candidate targeting `public.bridge_assets` (previously described as a null-only backfill; verify exact predicate and affected-row semantics in a disposable fixture).
  - `20261110183454 / loop_runtime_tables_and_atomic_tvod_fulfillment_staging`: 2 candidates targeting `public.loop_payment_events` and `public.loop_user_tvod_entitlements`. These were absent from the earlier one-UPDATE summary and require full value/provenance and replay review.
- This supersedes the earlier shorthand that there was only one UPDATE. It does not establish that all candidates are executable top-level commands; exact parser-backed classification remains incomplete.
- No SQL from the hosted ledger was executed. No replay or data write was performed.

## TVOD function hardening proposal

The companion SQL proposal is located at:

`supabase/staging-proposals/20261117_harden_loop_tvod_entitlement_search_path.sql`

It is intentionally outside the active migration directory. It preserves the observed `SECURITY DEFINER` model and existing authenticated/service-role execution intent while setting `search_path=pg_catalog` and schema-qualifying relation/function references. A local PGlite test exercises ACL and caller-scoped entitlement behavior.

This is a code proposal, not evidence that the hosted STAGING function has been changed. Before applying it, confirm the exact function definition, owner, grants, dependencies and schema on the intended STAGING project again. The current hosted STAGING function remains unchanged.

## Current gates

- 56-row metadata inventory and fingerprints: **PASS** (READ-ONLY).
- Full 56-statement source recovery and security classification: **BLOCKED / INCOMPLETE**.
- Rollback/recovery plan and restore simulation: **BLOCKED / NOT VERIFIED**.
- Full disposable PostgreSQL replay of the separate 56-record STAGING lineage: **NOT VERIFIED**. The existing repository replay covers the 69-file restored Production lineage only.
- Independent security review: **NOT VERIFIED**.
- Hosted STAGING TVOD hardening: **NOT APPLIED**.

## Access and risk

| Environment | Action | Access | Risk |
|---|---|---|---|
| STAGING DB `jbymleftneggcgutlcqu` | Source recovery and reconciliation | READ-ONLY | Migration provenance and rollback evidence remain incomplete |
| PRODUCTION DB `mlmgugivsyoxzdgwkbpu` | No action | READ-ONLY / HOLD | No Production change authorized |

No hosted database write, migration repair, deployment, merge, payment, email, OCI object write, or publication is part of this branch.
