# Test-only migration smoke run — 2026-10-28

## Scope and safety

- Target: `Crayons Projects - Testing DB`, project ref `jbymleftneggcgutlcqu`.
- PostgreSQL: `17.11`.
- Production boundary: `mlmgugivsyoxzdgwkbpu` (Crayons Bridge) was not written to. A read-only recheck shows its migration ledger still has 52 entries and its project remains ACTIVE_HEALTHY.
- This is a **partial smoke run**, not a full production-history replay. Exact SQL is still missing for a number of the 52 production history entries.

## Applied to the test project

The core schema file `migrations/0004_bridge.sql` was applied as a test-only baseline. Then nine current timestamped Supabase SQL files were applied sequentially with test-specific migration names:

1. `supabase/migrations/20260921_crayons_bridge_rls.sql`
2. `supabase/migrations/20261004_bridge_assets_add_censor_certificate.sql`
3. `supabase/migrations/20261006230000_bridge_commercial_engine.sql`
4. `supabase/migrations/20261006230000_duplicate_title_reconciliation.sql`
5. `supabase/migrations/20261007000000_harden_bridge_commercial_server_only.sql`
6. `supabase/migrations/20261007013000_bridge_commercial_control_plane.sql`
7. `supabase/migrations/20261007020000_bridge_financial_reversal_hardening.sql`
8. `supabase/migrations/20261007023000_bridge_commercial_performance_indexes.sql`
9. `supabase/migrations/20261027_story_concept_submission.sql`

All ten applied operations (baseline + nine SQL files) returned success. `20261006170000_reconcile_duplicate_bridge_titles.sql` was not executed because it is a comment-only compatibility/no-op file.

Because two checked-in files use the same `20261006230000` prefix, the smoke run used distinct `test_only_...` migration names. Supabase assigned generated versions around `20261028180816`–`20261028180926`. These are test-run records, not the production migration versions and not a replacement for fixing the repository's migration naming.

## Post-run verification

Read-only queries returned:

- PostgreSQL version: `17.11`.
- Public base tables: `27`.
- Public indexes: `70`.
- RLS enabled: `24` tables.
- Expected functions found: `2` (`bridge_service_margin_paise`, `bridge_duplicate_title_loop_release_allowed`).
- Story/Concept schema: `bridge_titles.submission_type`, `bridge_story_concept_submissions`, and `bridge_buyer_interest` exist.
- Commercial service catalog: one `STORY_CONCEPT_NETWORK_SUBMISSION` row exists and is inactive.
- Active service rates: `0`; active tax rates: `0`.
- Test data rows: `0` in the checked application tables, apart from the deliberate service-catalog seed row.

## Findings — not certified

Supabase Security Advisor raised warnings that require remediation/review before this schema is considered production-ready:

1. `public.bridge_duplicate_title_loop_release_allowed(text)` is a `SECURITY DEFINER` function and is executable by `anon` and `authenticated`, despite the migration's attempt to revoke public execution. A follow-up reviewed migration should explicitly revoke execution from `PUBLIC`, `anon`, and `authenticated` while preserving only intended server access.
2. Twenty-four tables have RLS enabled but no policies. This is consistent with a server-only access design only if table grants and all server paths are verified. The test query found `anon` and `authenticated` still have table-level SELECT privileges on `bridge_titles` and `bridge_payments`; explicitly verify and tighten grants before certification.
3. Performance Advisor reports four unindexed foreign keys: `bridge_assets.title_id`, `bridge_title_events.title_id`, `bridge_title_reconciliation_events.review_id`, and `bridge_title_reconciliation_snapshots.review_id`. These should be evaluated and indexed in a reviewed migration.

Unused-index notices are expected in a newly created test schema with no workload and are not by themselves a defect.

## What this run proves — and does not prove

**Proves:** the baseline plus the nine listed current SQL files execute successfully against this isolated Supabase PostgreSQL 17 project and create the expected core, commercial, duplicate-review, and Story/Concept objects.

**Does not prove:** that the complete 52-version production history can be replayed; that all current schema objects match Production; that the migration version history is canonical; that application E2E workflows pass; or that the security advisor findings are resolved.

The test database is now a partial smoke-test schema, not empty. A later full replay must use a fresh/reset disposable test project after the exact historical source chain is recovered. Do not reset or repair Production.
