# Supabase Preview reconciliation — 2026-10-28

## Current evidence and release boundary

- Canonical repository: `picturecrayons-cyber/Media-Factory`, inspected at `main` commit `b1600394bc90dfff404fb2e2c5b0c68237e6e0ec`.
- GitHub Actions run #1764 on commit `40e4fb882c948481bd498ef082bd5cadd30c6162` completed successfully. Both the app `gate` and temporary `workflow-postgres` jobs passed. This does not certify the Supabase Preview migration run.
- Supabase project `mlmgugivsyoxzdgwkbpu` (Crayons Bridge) is the only connected project. The branch listing shows only `main`, with `project_ref=mlmgugivsyoxzdgwkbpu`, `parent_project_ref=mlmgugivsyoxzdgwkbpu`, `is_default=true`, `status=MIGRATIONS_FAILED`. No isolated non-production branch is identified.
- Vercel project `bridge` has a READY production deployment for main commit `b1600394bc90dfff404fb2e2c5b0c68237e6e0ec`. A successful web deployment does not prove database migration reconciliation.
- A Supabase branch cost quote returned **US$0.01344/hour** (default Micro Compute baseline). Branching may also incur other resource usage; branch usage is not covered by Spend Cap. No branch was created because explicit cost approval is required.
- Current project integration settings (GitHub repo, working directory, production branch, automatic branching, and deploy-to-production setting) cannot be verified through the current Supabase connector. These must be checked in Supabase Dashboard > Project Settings > Integrations before attributing the CI result to Supabase Preview.

## Repository migration inventory

The canonical main tree contains 38 SQL files total: 10 under `supabase/migrations/`, 27 under the separate legacy `migrations/` directory, plus one SQL file outside these directories. `supabase/config.toml` contains only the Razorpay Edge Function JWT configuration and no declared migration directory override.

Current `supabase/migrations/` files:
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

The legacy folder contains name-based files from `0001_auth.sql` onward, including repeated prefixes `0018` (four files), `0020` (two files), `0007a`, and nested `migrations/auth/0001_auth.sql`. Its first migration describes Better Auth tables and says the files run for the app's Neon/PGLite fallback. These files are not interchangeable with timestamped Supabase CLI migration versions solely because names or SQL objects overlap.

## Remote history and exact filename/version mapping

Read-only queries against `supabase_migrations.schema_migrations` and the Supabase migration listing returned the same **50 remote versions** from `20260925141006` through `20261016161255`.

Exact comparison:
1. None of the 10 current files under `supabase/migrations/` has a filename with a 14-digit timestamp matching an existing remote version. The two short-prefix files do not provide a 14-digit version.
2. Five remote versions have names that embed a timestamp used by another local filename, but the recorded remote version differs from that filename:
   - remote `20261006185556`, `bridge_commercial_engine_20261006230000` ↔ local `20261006230000_bridge_commercial_engine.sql`
   - remote `20261006185640`, `harden_bridge_commercial_server_only_20261007000000` ↔ local `20261007000000_harden_bridge_commercial_server_only.sql`
   - remote `20261006195531`, `bridge_commercial_control_plane_20261007013000` ↔ local `20261007013000_bridge_commercial_control_plane.sql`
   - remote `20261006195536`, `bridge_financial_reversal_hardening_20261007020000` ↔ local `20261007020000_bridge_financial_reversal_hardening.sql`
   - remote `20261006195607`, `bridge_commercial_performance_indexes_20261007023000` ↔ local `20261007023000_bridge_commercial_performance_indexes.sql`
   
   The SQL names/contents are recognizably related, but this remains a name/version divergence rather than an exact migration match.
3. The two local files with version prefix `20261006230000` have distinct SQL purposes: one creates the commercial engine; the other creates duplicate-title review/audit tables. This may conflict with timestamp-based migration ordering and needs a deliberate version assignment based on historical order and dependencies. Do not rename or reorder either automatically.
4. Remote versions without an exact local timestamped counterpart include the initial legacy-import, auth and operational schema baselines; webhook/foreign-key index additions; Loop runtime, identity, payment and semantic-search migrations; poster/studio schema; buyer access, publication gates and catalog/deal-room reconciliation; RLS and server-only hardening; delivery/finance; rights-ready submission and submission-intake hardening; storage economics; and final asset-kind constraint. Some legacy files have similar names/SQL, but similarity alone does not prove equivalent side effects, ordering, grants or RLS configuration.
5. The remote history ends at `20261016161255`, named `bridge_assets_kind_constraint_20261016`; there is no current local `supabase/migrations/20261016161255_*.sql` file.
6. The local Story Concept migration `20261027_story_concept_submission.sql` is not present in remote migration history, although the tables `bridge_story_concept_submissions`, `bridge_buyer_interest` and column `bridge_titles.submission_type` already exist in Production. This is a confirmed schema/history mismatch, but not permission to re-run the migration or mark it applied without proving schema equivalence.
7. Production currently has commercial tables including `bridge_service_catalog`, `bridge_service_rates`, `bridge_tax_rates`, `bridge_service_quotes`, `bridge_service_quote_lines`, `bridge_service_orders`, `bridge_service_order_events`, `bridge_service_invoices`, `bridge_financial_ledger`, `bridge_service_costs`, `bridge_service_settlement_rules`, and `bridge_service_settlement_lines`. The inspected table list did not include all duplicate-title review tables defined in the current local migration. This confirms the current schema cannot be inferred from filenames alone; it does not prove which migration ran, failed, was skipped, or was superseded.

## OCI E2E

The prior Bridge OCI Storage E2E run #44 failed closed because `BRIDGE_E2E_ASSET_ID` was empty. The workflow/script appeared to target a production round-trip. Do not rerun until the workflow, GitHub Environment, database, bucket, credentials and test asset are verified non-production.

## Safe next actions

1. Verify Supabase Dashboard > Project Settings > Integrations: selected Git repository, working directory (`.` if `supabase/` is at root), production branch, Automatic branching and Deploy to production settings. Supabase docs confirm that automatic branching creates isolated branches for Git branches, Supabase migrations in the `supabase/migrations/` directory run in order, and preview branches do not copy production data.
2. Before creating a branch, approve the quoted starting cost of **US$0.01344/hour**, and account for possible additional compute, disk, egress and storage use. Then create an isolated branch and verify its returned `project_ref` is different from production before running any writes.
3. In the isolated target, build a version-by-version mapping of all remote history rows to actual source SQL and schema evidence, including migration files from older PRs/commits if recoverable. Do not map by name similarity alone.
4. Reconstruct missing historical migrations from authoritative Git history when possible. Treat legacy migrations and schema snapshots as evidence, not automatic replacements.
5. Determine the original intended order of duplicate-version and short-prefix files. Test the complete reconstructed migration sequence on a disposable isolated target; verify resulting tables, columns, data effects, grants, RLS and policies against the intended design.
6. Only after schema equivalence is demonstrated, consider documented migration-history repair against the isolated target, if necessary. Repair edits history records; it does not execute SQL. Never repair or reset Production to make the check green.
7. Configure OCI E2E to use an explicitly named preview GitHub Environment and preview-only resources, with fail-closed target and asset checks. Re-run only after all resource boundaries are verified and record results against an exact commit SHA.
8. Keep Production HOLD / NOT CERTIFIED until these gates pass.

## Not done

No Production database, migration-history row, RLS policy, authentication configuration, credential, OCI object, payment record, email setting, Vercel environment or deployment was changed. No Supabase branch was created, no migration history repaired, no reset run and no OCI E2E rerun performed.

## References

- Supabase local development and migration workflow: https://supabase.com/docs/guides/local-development/cli-workflows
- Supabase GitHub integration: https://supabase.com/docs/guides/deployment/branching/github-integration
- Supabase branching: https://supabase.com/docs/guides/deployment/branching
- Supabase branching usage and pricing: https://supabase.com/docs/guides/platform/manage-your-usage/branching
- Supabase migration repair reference: https://supabase.com/docs/reference/cli/supabase-migration-repair
- Vercel production deployment: https://vercel.com/stream-vista-opc-pvt-ltd-s-projects/bridge/ZsWHyTAYoTNSx4XKiQsH9sUxz7Wg
