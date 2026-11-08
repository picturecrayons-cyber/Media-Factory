# STAGING migration reconciliation — 2026-11-08

Scope: read-only comparison of the 27 migration-history rows in Supabase project `jbymleftneggcgutlcqu` against SQL files present on branch `fix/licensing-corrective-gate-a519036-20261108`.

**No database changes were made.** This is a reconciliation register, not permission to repair or rewrite migration history.

## Environment and action record

| Target | Action | Access | Risk |
|---|---|---|---|
| STAGING DB `jbymleftneggcgutlcqu` | Read migration history and schema metadata | READ-ONLY | Low; no writes |
| PRODUCTION DB `mlmgugivsyoxzdgwkbpu` | No action | READ-ONLY / HOLD | No production interaction |

## Migration-history mapping

| # | Applied version | Applied name | Repository evidence | Classification |
|---:|---|---|---|---|
| 1 | 20261028180816 | test_only_bridge_core_baseline_20261028 | No exact file; likely a test baseline/snapshot covering earlier core migrations | UNRESOLVED — require SQL/hash evidence |
| 2 | 20261028180834 | test_only_bridge_rls_20260921 | `supabase/migrations/20260921_crayons_bridge_rls.sql` | PROBABLE MATCH — test-only wrapper name differs |
| 3 | 20261028180856 | test_only_bridge_assets_censor_certificate_20261004 | `supabase/migrations/20261004_bridge_assets_add_censor_certificate.sql` | PROBABLE MATCH — test-only wrapper name differs |
| 4 | 20261028180900 | test_only_bridge_commercial_engine_20261006230000 | `supabase/migrations/20261006230000_bridge_commercial_engine.sql` | PROBABLE MATCH — same embedded version; inspect applied SQL |
| 5 | 20261028180907 | test_only_duplicate_title_reconciliation_20261028 | `supabase/migrations/20261006170000_reconcile_duplicate_bridge_titles.sql`; also `supabase/migrations/20261006230000_duplicate_title_reconciliation.sql` | AMBIGUOUS — two plausible files; do not infer |
| 6 | 20261028180912 | test_only_harden_commercial_server_only_20261028 | `supabase/migrations/20261007000000_harden_bridge_commercial_server_only.sql` | PROBABLE MATCH |
| 7 | 20261028180915 | test_only_commercial_control_plane_20261028 | `supabase/migrations/20261007013000_bridge_commercial_control_plane.sql` | PROBABLE MATCH |
| 8 | 20261028180918 | test_only_financial_reversal_hardening_20261028 | `supabase/migrations/20261007020000_bridge_financial_reversal_hardening.sql` | PROBABLE MATCH |
| 9 | 20261028180922 | test_only_commercial_performance_indexes_20261028 | `supabase/migrations/20261007023000_bridge_commercial_performance_indexes.sql` | PROBABLE MATCH |
| 10 | 20261028180926 | test_only_story_concept_submission_20261028 | `supabase/migrations/20261027_story_concept_submission.sql` | PROBABLE MATCH |
| 11 | 20261029014139 | test_bridge_workflow_schema_parity_20261029 | No exact migration file identified | UNRESOLVED — may be test-only schema setup |
| 12 | 20261029014203 | test_censor_certificate_metadata_versions_20261029 | No exact migration file identified | UNRESOLVED — may be test-only schema setup |
| 13 | 20261030133503 | testing_security_hardening_20261030 | No exact migration file identified | UNRESOLVED — must identify SQL source |
| 14 | 20261104203045 | bridge_staging_data_api_lockdown_20261105 | `migrations/0008_bridge_data_api_lockdown.sql` | PROBABLE MATCH — confirm applied SQL/hash |
| 15 | 20261104203415 | bridge_staging_function_execute_defaults_20261105 | No exact migration file identified | UNRESOLVED |
| 16 | 20261105084111 | bridge_staging_identity_links_reconciliation_20261105 | `migrations/0007a_identity_links.sql` | PROBABLE MATCH — confirm applied SQL/hash |
| 17 | 20261105143656 | 0018_bridge_rights_ready_submission | `migrations/0018_bridge_rights_ready_submission.sql` | NAME MATCH |
| 18 | 20261106025823 | bridge_testing_workspace_rls_20261106 | No exact migration file identified | UNRESOLVED |
| 19 | 20261106025842 | bridge_asset_storage_provenance_0022_20261106 | No exact migration file identified | UNRESOLVED — schema objects exist but source migration file not found on branch |
| 20 | 20261106031604 | bridge_titles_no_browser_update_policy_20261106 | No exact migration file identified | UNRESOLVED |
| 21 | 20261106031723 | bridge_server_authoritative_uploads_0023_20261106 | No exact migration file identified | UNRESOLVED — existing upload tables require source/hash match |
| 22 | 20261106032656 | bridge_workspace_verified_identity_guard_20261106 | No exact migration file identified | UNRESOLVED |
| 23 | 20261106051631 | story_concept_atomic_idempotency_testing_20261106 | No exact migration file identified | UNRESOLVED — likely test-only schema change; verify |
| 24 | 20261106063206 | razorpay_webhook_processing_lease_schema | No exact migration file identified | UNRESOLVED |
| 25 | 20261106083338 | revenue_distribution_intelligence_20261106 | No exact migration file identified | UNRESOLVED |
| 26 | 20261106083617 | 20261106_story_concept_buyer_mandates | No exact migration file identified | UNRESOLVED |
| 27 | 20261106084908 | 20261106_story_concept_buyer_mandates | No exact migration file identified | DUPLICATE NAME — distinct applied versions; investigate SQL/hash and idempotency |

## Findings

- 27 applied migration-history rows were returned by Supabase.
- The repository contains multiple migration roots: `migrations/` and `supabase/migrations/`, plus a nested `migrations/auth/` file.
- There is an existing duplicate embedded timestamp `20261006230000` in two different SQL filenames. This is distinct from the duplicate applied name at rows 26–27.
- Several applied STAGING migration names have no obvious matching SQL file on this branch. A filename similarity is not proof that the applied SQL matches.
- The two `20261106_story_concept_buyer_mandates` records must not be collapsed, deleted, renamed in history, or replayed without inspecting their actual SQL and effects.

## Required evidence before any DIT migration

1. Obtain the exact SQL body or immutable source/hash for every unresolved and ambiguous applied record from the controlled migration source/release artifact.
2. Compare applied schema effects with the live STAGING catalog; identify objects created/altered by each record.
3. Reconcile RLS, FORCE RLS, policies, table grants, sequence grants, function EXECUTE grants, and SECURITY DEFINER ownership/search_path for DIT-related objects.
4. Map existing `bridge_private.upload_sessions`, `upload_parts`, `asset_verification_jobs`, `bridge_assets`, and audit tables to a single durable ingest/verification/sign-off lifecycle.
5. Only then draft an additive DIT migration. Review it separately before any STAGING WRITE.

## Release status

**BLOCKED / NOT VERIFIED:** This register is not a complete SQL/hash reconciliation. No migration has been applied. Production remains HOLD / NOT CERTIFIED / NO-GO.
