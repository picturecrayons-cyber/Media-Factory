# Supabase Preview reconciliation — 2026-10-28

## Current evidence and boundary

- Canonical repository: `picturecrayons-cyber/Media-Factory`, inspected at `main` commit `b1600394bc90dfff404fb2e2c5b0c68237e6e0ec`.
- The latest CI run for this documentation branch is GitHub Actions run #1764, commit `40e4fb882c948481bd498ef082bd5cadd30c6162`; GitHub reports conclusion `success`. This validates the repository CI workflow, not a Supabase Preview deployment or database migration application.
- Supabase project `mlmgugivsyoxzdgwkbpu` (Crayons Bridge) is the only accessible project. The branch listing shows just `main`, with `project_ref=mlmgugivsyoxzdgwkbpu`, `parent_project_ref=mlmgugivsyoxzdgwkbpu`, `is_default=true`, and `status=MIGRATIONS_FAILED`. It is not an isolated preview target.
- Vercel project `bridge` reports a latest READY production deployment at `b1600394bc90dfff404fb2e2c5b0c68237e6e0ec`. A READY web deployment does not certify DB migration reconciliation.
- A Supabase development branch quote returned `US$0.01344/hour`. No branch was created; explicit cost approval is required before creating it.

## Inventory at canonical main

Repository tree reports 38 SQL files in total: 10 in `supabase/migrations/` and 27 under the separate legacy `migrations/` directory (plus one SQL path outside these directories). The current `supabase/config.toml` contains only the Edge Function JWT setting and does not declare a migration directory override.

The current `supabase/migrations/` inventory:
- `20260921_crayons_bridge_rls.sql`
- `20261004_bridge_assets_add_censor_certificate.sql`
- `20261006170000_reconcile_duplicate_bridge_titles.sql`
- `20261006230000_bridge_commercial_engine.sql`
- `20261006230000_duplicate_title_reconciliation.sql`
- `20261007000000_harden_bridge_commercial_server_only.sql`
- `20261007013000_bridge_commercial_control_plane.sql`
- `20261007020000_bridge_financial_reversal_hardening.sql`
- `20261007023000_bridge_commercial_performance_indexes.sql`
- `20261027_story_concept_submission.sql`

The two files with `20261006230000` are different SQL changes: one builds the commercial engine; the other adds duplicate-title review/audit tables. Both currently use the same version prefix, creating a migration-version collision risk. Do not rename either until history and intended ordering are resolved.

The two short-prefix files `20260921_...` and `20261004_...` use non-14-digit prefixes. Verify compatibility with the configured Supabase CLI/integration before depending on them.

The root-level legacy directory contains numbered, name-based migration files from `0001_auth.sql` through `0021_bridge_organizations.sql`, including repeated prefixes `0018` (four files) and `0020` (two files), a `0007a` file and nested `migrations/auth/0001_auth.sql`. These are documented in the repository as migration files for the Better Auth / legacy application and are not interchangeable with timestamped Supabase CLI migration versions.

## Remote migration history comparison

Production's `supabase_migrations.schema_migrations` currently lists 50 versions, from `20260925141006` through `20261016161255`. A direct read-only query of the table and the Supabase migrations tool returned the same sequence.

**Exact filename/version reconciliation:**

1. None of the 10 current files under `supabase/migrations/` has a filename whose 14-digit timestamp exactly matches an existing remote version. The two short-prefix files do not provide a 14-digit version either.
2. Remote versions `20261006185556`, `20261006185640`, `20261006195531`, `20261006195536`, and `20261006195607` have descriptive names that embed later local timestamps. SQL contents are recognizably aligned with the commercial engine, server-only hardening, control plane, financial reversal hardening, and performance-index files, respectively. However, the recorded remote version is earlier than the timestamp encoded in each local filename; this remains a version/name divergence, not a clean exact match.
3. Remote history contains versions/names with no same-version local file in `supabase/migrations/`, including early schema baselines, auth/operational/RLS changes, catalog/deal-room reconciliations, watchlists, duplicate merge gate/RLS changes, rights-ready submission, submission intake hardening, storage economics, and the final asset-kind constraint. Some legacy files have related names or overlapping SQL, but names alone cannot establish equivalent execution, order, grants, RLS state, or data effects.
4. The latest remote version `20261016161255` is `bridge_assets_kind_constraint_20261016`; there is no corresponding current `supabase/migrations/20261016161255_*.sql` file in `main`.
5. The Story Concept file `20261027_story_concept_submission.sql` is a local-only migration version (not recorded remotely), even though the relevant tables and `bridge_titles.submission_type` already exist in Production. This is evidence of schema/history drift, not permission to re-run the SQL or mark it applied.
6. The production schema contains `bridge_service_catalog`, `bridge_service_rates`, `bridge_tax_rates`, `bridge_service_quotes`, `bridge_service_quote_lines`, `bridge_service_orders`, `bridge_service_order_events`, `bridge_service_invoices`, `bridge_financial_ledger`, `bridge_service_costs`, `bridge_service_settlement_rules`, and `bridge_service_settlement_lines`; duplicate-title review tables named in the timestamped migrations were not all present in the inspected table list. This confirms the database's current schema cannot be inferred from migration filenames alone. It does not by itself identify which migration ran, was skipped, or was later superseded.

## OCI test and release status

The earlier Bridge OCI Storage E2E run #44 failed closed because `BRIDGE_E2E_ASSET_ID` was empty. The workflow/script appeared to target a production round-trip. Do not rerun until the target DB, bucket, credentials, workflow environment and test asset are verified as non-production.

## Safe next actions

1. Verify the Supabase Dashboard > Project Settings > Integrations configuration: Git repository, working directory, production branch and automatic branching. The connector does not expose these integration settings.
2. Obtain explicit approval for the quoted Supabase branch cost, then create an isolated development branch and confirm its new project ref differs from production before any writes. Do not create a duplicate permanent Supabase project as a workaround.
3. In the isolated target, map all 50 remote history entries against actual source SQL and schema evidence, including which legacy migrations were separately applied. Review all migration contents and expected order; do not map by filename similarity alone.
4. Reconstruct or obtain missing historical Supabase migration files from authoritative Git history/PR commits when possible. Treat schema snapshots and legacy migration files as evidence, not automatic replacements.
5. Resolve the duplicate timestamp and short-prefix files using a reviewed migration plan; test the full sequence on an isolated disposable target. Confirm resulting schema, grants and RLS state against the intended schema before any history repair.
6. Fix the OCI E2E workflow to require a named preview GitHub Environment, preview-only credentials, a non-production target check and a valid test asset ID; fail closed on missing/ambiguous environment variables.
7. Record exact-commit test evidence. Keep Production HOLD / NOT CERTIFIED until database-target boundaries and all release gates are proven.

## Not done

No Production database or migration-history rows, RLS policies, authentication configuration, credentials, OCI objects, payment records, email configuration, Vercel environment, deployment or traffic was changed. No branch was created, no migration repaired, no database reset, and no OCI E2E rerun was performed.

## References

- Supabase Database Migrations: https://supabase.com/docs/guides/deployment/database-migrations
- Supabase Branching: https://supabase.com/docs/guides/deployment/branching
- Supabase GitHub Integration: https://supabase.com/docs/guides/deployment/branching/github-integration
- Supabase Branching Troubleshooting: https://supabase.com/docs/guides/deployment/branching/troubleshooting
- Vercel production deployment: https://vercel.com/stream-vista-opc-pvt-ltd-s-projects/bridge/ZsWHyTAYoTNSx4XKiQsH9sUxz7Wg
