# PR #499 migration identity and dependency proposal — 2026-11-11

Status: DRAFT PROPOSAL ONLY — NOT APPROVED FOR APPLY

Scope: code/repository review of `picturecrayons-cyber/Media-Factory`, PR #499, and the owner-approved Bridge Testing DB migration evidence. This document does not modify SQL migration history, a database, deployment configuration, or Production.

## Decision summary

Do not retain the ambiguous numeric filename `migrations/0023_bridge_production_vault.sql`.

The PR #499 branch currently contains the timestamped file:

`migrations/20261110121500_bridge_production_vault.sql`

This is the preferred proposed identity because:

- It is unique among the top-level migration filenames inspected on PR #499's branch.
- Its version prefix `20261110121500` sorts after the latest reported Testing DB migration version `20261109135114`.
- It avoids reusing the already-applied version `20261106031723`, whose recorded name is `bridge_server_authoritative_uploads_0023_20261106`.
- It preserves the existing applied history rather than renaming, deleting, or rewriting an applied migration record.

The timestamped filename is already present on PR #499's branch. The proposal is therefore to retain that candidate identity, subject to the gates below—not to create a second file with another guessed timestamp. This does NOT certify that the migration is ready to apply.

## Evidence and identity distinctions

### STAGING DB — READ-ONLY

Project: `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB).

- Supabase migration ledger: 31 records.
- Latest reported version: `20261109135114`.
- Applied version `20261106031723` is recorded as `bridge_server_authoritative_uploads_0023_20261106`.
- The name `story_concept_buyer_mandates` occurs at versions `20261106083617` and `20261106084908`; the reported SQL digests differ. Treat these as two separate versioned records until immutable SQL provenance proves otherwise. Do not collapse them based on the shared name.
- The app-specific `public._migrations` ledger was reported absent, while `supabase_migrations.schema_migrations` exists.
- Exact repository SQL content matches were confirmed for 9/31 records; 22/31 remain unmatched. Filename similarity is not accepted as provenance.

### PRODUCTION DB — NOT ACCESSED IN THIS TASK

Project: `mlmgugivsyoxzdgwkbpu`. No Production query or write was performed for this proposal. Production remains HOLD / NOT CERTIFIED / NO-GO.

## Repository runner behavior inspected

On PR #499's branch:

- `scripts/migrate.mjs` scans only the top-level `migrations/` directory for application.
- `scripts/migration-plan.mjs` keys the app ledger by basename and sorts filenames lexically.
- The migrator detects the Supabase migration ledger, inventories both `migrations/` and `supabase/migrations/`, and uses exact normalized SQL SHA-256 matching for provenance.
- If the Supabase ledger exists but `public._migrations` is absent, the migrator adds a blocker and refuses to synthesize the app ledger.
- If provenance reconciliation is incompatible, it throws before applying migration SQL.

Therefore the timestamped name does not bypass the current ledger blocker. Do not run `db:migrate`, `build:with-migrate`, or any equivalent remote migration command against Testing DB while the 22 unmatched records and missing app ledger remain unresolved.

## Candidate migration dependencies and schema review

The timestamped PR #499 migration creates nine Production Vault tables:

1. `bridge_productions`
2. `bridge_production_shooting_days`
3. `bridge_production_camera_cards`
4. `bridge_production_ingest_manifests`
5. `bridge_production_clips`
6. `bridge_production_copy_verifications`
7. `bridge_production_conversion_jobs`
8. `bridge_production_dit_signoffs`
9. `bridge_production_audit_events`

It also depends on existing schema objects and assumptions that must be verified against a schema-only snapshot before any application:

- `bridge_titles(id)` and `bridge_titles.owner_organization_id`; the migration creates a unique index on this pair and uses it as a composite FK target.
- `bridge_profiles(user_id)` for creator, reviewer and actor references.
- `gen_random_uuid()` availability.
- PostgreSQL support and semantics for the declared composite constraints, partial expression index, checks and JSONB fields.

The current SQL explicitly does not FK `organization_id` to `bridge_organizations`, because that table was absent in the earlier approved Testing DB snapshot. Membership/tenant authorization is expected to be enforced by server code. This means tenant isolation is not proven by this migration alone.

### Access-control blocker

The migration enables RLS and revokes table privileges from `PUBLIC`, `anon`, and `authenticated`. It does not itself grant an explicit least-privilege role on the nine tables. Before any migration approval, identify the real server connection role used by every DIT operation and prove its required SELECT/INSERT/UPDATE privileges and RLS behavior. Do not assume `service_role` is the runtime role; earlier read-only evidence observed a Testing DB app connection as `postgres` with `BYPASSRLS`, which requires separate secret-boundary and runtime verification.

Required allow/deny tests must cover all nine tables, every DIT operation, unauthorized roles, cross-Studio access, and object/manifest/card/clip/sign-off parent-scope tampering.

## Required gates before a separate STAGING write approval

1. Produce an immutable 31-record ledger export including version, name and SQL statements/digests.
2. Resolve all 22 unmatched records using authoritative historical SQL/provenance; do not infer from filenames.
3. Explain and preserve the two distinct `story_concept_buyer_mandates` records by version and digest.
4. Reconcile the absent `public._migrations` ledger with the Supabase ledger through an explicit, reviewed migration-runner design. No automatic ledger synthesis.
5. Verify the timestamped candidate is the only intended new migration identity and that it sorts after the reconciled applied history.
6. Compare every referenced column, type, PK/FK, unique index, extension/function and constraint with a fresh STAGING schema-only snapshot.
7. Resolve the server-role grants and RLS design; add exact allow/deny and cross-tenant tests.
8. Run exact-commit CI, PostgreSQL migration tests, rollback rehearsal on a disposable database, and independent code/security review.
9. Prepare a reviewed STAGING-only execution and rollback plan. Obtain a separate explicit STAGING WRITE approval before any database change.

## Action / access / risk ledger

| Target | Action | Access | Risk / status |
|---|---|---|---|
| GitHub Draft branch | Add this proposal document only | WRITE (repository file) | Low; no SQL migration changed |
| PR #499 SQL | Inspect timestamped candidate | READ-ONLY | BLOCKED for application |
| STAGING DB `jbymleftneggcgutlcqu` | Use previously collected migration evidence only | READ-ONLY | BLOCKED: 22 unmatched records and ledger mismatch |
| PRODUCTION DB `mlmgugivsyoxzdgwkbpu` | No access / no operation | NONE | HOLD / NOT CERTIFIED / NO-GO |

## Explicit non-actions

- No migration SQL was applied.
- No STAGING or Production database write occurred.
- No applied migration record was renamed, deleted, inserted or rewritten.
- No PR was created or merged by this proposal.
- No deployment, Preview environment change, OCI object write, customer email or payment action occurred.
- No paid upgrade or additional spend was incurred.

App-inu pani kittaruthu. Bridge authorizes → Loop delivers.
