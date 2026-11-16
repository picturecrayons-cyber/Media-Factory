# STAGING DB migration lineage and recovery plan — 2026-11-17

## Scope and environment separation

- **STAGING / Testing DB:** Supabase project `jbymleftneggcgutlcqu`, ap-south-1.
- **PRODUCTION DB:** Supabase project `mlmgugivsyoxzdgwkbpu`, ap-southeast-1.
- This document concerns STAGING only. Production remains READ-ONLY / HOLD.
- No database writes, migration repair, `db push`, migration application, or data export to a hosted third party is authorized by this proposal.

## Important correction: two different migration lineages

The repository's active `supabase/migrations/` directory contains 69 files and its README identifies them as the restored **Production** migration ledger source (2026-11-16). Those 69 files are not a one-to-one comparison set for the 55 records in the Testing DB ledger.

The STAGING database has a separate, test-specific migration history, including `test_only_*`, `*_testing`, and later Loop/Bridge staging migrations. Therefore, comparing only the counts (69 vs 55), or comparing unqualified filenames, does not establish migration drift or compatibility. The earlier shorthand statement that all 55 Testing records were unmatched against the 69 Production files was too broad and is superseded by this distinction.

## Verified STAGING ledger observations

- `supabase_migrations.schema_migrations` returned 55 records at the time of read-only inspection.
- The ledger stores `version`, `name`, `statements`, and `rollback`.
- The duplicate logical name `20261106_story_concept_buyer_mandates` appears at versions `20261106083617` and `20261106084908`.
- Their original SQL hashes differ:
  - `20261106083617`: `bb5ddd11b1cd5b612f41c65a2b80d4e38b2d940fe3c0bfbf8b26d2d0484e09bc`
  - `20261106084908`: `d601e65f862c72e9b7b19bed659fba102be643d65cbe9b4e09434fce9c78ccd1`
- After removing SQL comments and normalizing whitespace, both produce SHA-256 `c4dbf361f068591586dfde5e2c01d2bd95ff1e810d86d622fddb4279d61fe0f6`. The SQL operations are therefore equivalent under that normalization, but both historical ledger rows must be preserved.
- The inspected migration rows reported no rollback statements. This does not prove that no recovery procedure exists elsewhere; it means the ledger itself does not supply one.

## Required recovery procedure

1. Read the 55 STAGING rows in small batches, retaining each exact `version`, `name`, statement ordering, statement count, and rollback count.
2. Compute SHA-256 over the exact stored statement representation and separately over a documented normalized SQL representation. Never overwrite the original evidence with normalized text.
3. Classify each statement before putting it in source control: schema-only DDL, grants/policies/functions, deterministic reference data, environment-specific data, secrets, or unsafe/irreversible operation.
4. Exclude secrets, credentials, user data, payment payloads, production identifiers and any non-source runtime data. Stop if a row mixes source SQL with private data; redact only in a clearly marked derivative and preserve the original hash without publishing the raw payload.
5. Recover each approved source into a **non-active** STAGING recovery archive, keyed by both version and name. Do not place recovered Testing migrations in the active Production `supabase/migrations/` directory.
6. Reconcile the archive against the actual STAGING schema: tables, columns, constraints, indexes, triggers, functions, RLS, policies, grants, ownership and extension dependencies.
7. Prepare forward-fix and restore/recovery plans for every non-transactional or destructive operation. Do not infer rollback from an empty `rollback` array.
8. Run replay only against a fresh local disposable PostgreSQL/Supabase instance. Never point the replay runner at STAGING or PRODUCTION.
9. Request independent review and a separate, explicit STAGING WRITE approval before any hosted migration.

## TVOD function hardening proposal

The companion SQL proposal is located at:

`supabase/staging-proposals/20261117_harden_loop_tvod_entitlement_search_path.sql`

It is intentionally outside the active migration directory. It preserves the observed `SECURITY DEFINER` model and existing authenticated/service-role execution intent while setting `search_path=pg_catalog` and schema-qualifying relation/function references. A local PGlite test exercises ACL and caller-scoped entitlement behavior.

This is a code proposal, not evidence that the hosted STAGING function has been changed. Before applying it, confirm the exact function definition, owner, grants, dependencies and schema on the intended STAGING project again.

## Access and risk

| Environment | Action | Access | Risk |
|---|---|---|---|
| STAGING DB `jbymleftneggcgutlcqu` | Source recovery and reconciliation | READ-ONLY | Migration provenance and rollback evidence remain incomplete |
| PRODUCTION DB `mlmgugivsyoxzdgwkbpu` | No action | READ-ONLY / HOLD | No Production change authorized |

No hosted database write, migration repair, deployment, merge, payment, email, OCI object write, or publication is part of this branch.
