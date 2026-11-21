# STAGING DB — 28 Applied Migration Source Manifest

> Evidence-only artifact. Generated from read-only migration-history queries on the Bridge Testing DB. This document is not an executable migration and does not authorize applying SQL.

- Target: **STAGING DB** — `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB)
- Access: **READ-ONLY**
- Action: Read `supabase_migrations.schema_migrations` metadata and first statement for each record
- Risk: **Low / read-only**; no schema or row writes performed
- PRODUCTION DB: `mlmgugivsyoxzdgwkbpu` — **HOLD / NOT CERTIFIED / NO-GO; not queried or changed in this operation**
- Records found: **28**
- Each record statement count: **1 (all 28)**
- Repository main inspected: `picturecrayons-cyber/Media-Factory` @ `12b5d4a72cb1b0e2b1f2ed3579ff94b751fb576e`
- Reconciliation: **10 exact matches + 1 normalized match + 17 without exact source file = 28**

| Version | Migration name | Statements | SQL chars | MD5 | Repository reconciliation |
|---|---|---:|---:|---|---|
| `20261028180816` | `test_only_bridge_core_baseline_20261028` | 1 | 4599 | `999312a09501bf6a3e69dbc9c8e5b5ed` | EXACT |
| `20261028180834` | `test_only_bridge_rls_20260921` | 1 | 1453 | `ab54676e6b0b6da091daf8040022496e` | EXACT |
| `20261028180856` | `test_only_bridge_assets_censor_certificate_20261004` | 1 | 448 | `6bd43955570f1a93574c115930161c39` | EXACT |
| `20261028180900` | `test_only_bridge_commercial_engine_20261006230000` | 1 | 28612 | `1a388b2f4183da815b675ea86e8aaba0` | EXACT |
| `20261028180907` | `test_only_duplicate_title_reconciliation_20261028` | 1 | 4829 | `ff654e952729e33b586f6a2af07a4885` | EXACT |
| `20261028180912` | `test_only_harden_commercial_server_only_20261028` | 1 | 1233 | `c53fb59ec77848efc3ae4af2584c7e32` | EXACT |
| `20261028180915` | `test_only_commercial_control_plane_20261028` | 1 | 6907 | `1bde19c1b7d2e6bbcda51ee86cdb887c` | EXACT |
| `20261028180918` | `test_only_financial_reversal_hardening_20261028` | 1 | 702 | `dd60953c3a722560f7f96254f1260314` | EXACT |
| `20261028180922` | `test_only_commercial_performance_indexes_20261028` | 1 | 809 | `c596b5748f70c2d3636cdbb4f8106fe3` | EXACT |
| `20261028180926` | `test_only_story_concept_submission_20261028` | 1 | 3020 | `e9d8cc7188d1bb1b691bd8e48589117d` | EXACT |
| `20261029014139` | `test_bridge_workflow_schema_parity_20261029` | 1 | 5667 | `eba2ecce8632aa604d9d7036a5b34d75` | ARCHIVED; no exact source file |
| `20261029014203` | `test_censor_certificate_metadata_versions_20261029` | 1 | 1746 | `652ecbf939c1fa6857f5b87f5eac0940` | ARCHIVED; no exact source file |
| `20261030133503` | `testing_security_hardening_20261030` | 1 | 460 | `81380afbf1bbb7823d0f9942e2c16bae` | ARCHIVED; no exact source file |
| `20261104203045` | `bridge_staging_data_api_lockdown_20261105` | 1 | 1023 | `28adb5d3e173367948fdcc8dd849d49b` | ARCHIVED; no exact source file |
| `20261104203415` | `bridge_staging_function_execute_defaults_20261105` | 1 | 282 | `7600b57e0a655a27e031f69b605008a4` | ARCHIVED; no exact source file |
| `20261105084111` | `bridge_staging_identity_links_reconciliation_20261105` | 1 | 473 | `04548f0e01c9dd977723aecddb5d1557` | ARCHIVED; no exact source file |
| `20261105143656` | `0018_bridge_rights_ready_submission` | 1 | 1476 | `e0ba21b942bbd4aa15d234f753f68895` | NORMALIZED |
| `20261106025823` | `bridge_testing_workspace_rls_20261106` | 1 | 9314 | `a533a4b9522b5c142180eb66a95ebadd` | ARCHIVED; no exact source file |
| `20261106025842` | `bridge_asset_storage_provenance_0022_20261106` | 1 | 982 | `c23005a832821c913a1e473888d5c7b3` | ARCHIVED; no exact source file |
| `20261106031604` | `bridge_titles_no_browser_update_policy_20261106` | 1 | 73 | `62f4c6aa38f1821da1fe3c93f0e7f54c` | ARCHIVED; no exact source file |
| `20261106031723` | `bridge_server_authoritative_uploads_0023_20261106` | 1 | 6770 | `138f9191fa5c8088205c8dfb571175bc` | ARCHIVED; no exact source file |
| `20261106032656` | `bridge_workspace_verified_identity_guard_20261106` | 1 | 1003 | `5e2dd078fa415c727c7f961ee2c1bb93` | ARCHIVED; no exact source file |
| `20261106051631` | `story_concept_atomic_idempotency_testing_20261106` | 1 | 1485 | `e12902db63885903db165155f7bb52e1` | ARCHIVED; no exact source file |
| `20261106063206` | `razorpay_webhook_processing_lease_schema` | 1 | 838 | `60164e58b822dae98a03af26655d6c77` | ARCHIVED; no exact source file |
| `20261106083338` | `revenue_distribution_intelligence_20261106` | 1 | 3783 | `fd9917c46cbc470d6ece645c98d1cf8f` | ARCHIVED; no exact source file |
| `20261106083617` | `20261106_story_concept_buyer_mandates` | 1 | 3260 | `5ad8990d3db9206c81d2b3a0cdb81e78` | ARCHIVED; no exact source file |
| `20261106084908` | `20261106_story_concept_buyer_mandates` | 1 | 3500 | `3bd69fad37c374cc93e3ac15f4e3b616` | ARCHIVED; no exact source file |
| `20261108222208` | `grant_authenticated_usage_bridge_private_schema` | 1 | 54 | `48d5890496891bef99090065351c76f0` | ARCHIVED; no exact source file |

## Exact / normalized repository matches

| Version | Repository file | Match |
|---|---|---|
| `20261028180816` | `migrations/0004_bridge.sql` | EXACT |
| `20261028180834` | `supabase/migrations/20260921_crayons_bridge_rls.sql` | EXACT |
| `20261028180856` | `supabase/migrations/20261004_bridge_assets_add_censor_certificate.sql` | EXACT |
| `20261028180900` | `supabase/migrations/20261006230000_bridge_commercial_engine.sql` | EXACT |
| `20261028180907` | `supabase/migrations/20261006230000_duplicate_title_reconciliation.sql` | EXACT |
| `20261028180912` | `supabase/migrations/20261007000000_harden_bridge_commercial_server_only.sql` | EXACT |
| `20261028180915` | `supabase/migrations/20261007013000_bridge_commercial_control_plane.sql` | EXACT |
| `20261028180918` | `supabase/migrations/20261007020000_bridge_financial_reversal_hardening.sql` | EXACT |
| `20261028180922` | `supabase/migrations/20261007023000_bridge_commercial_performance_indexes.sql` | EXACT |
| `20261028180926` | `supabase/migrations/20261027_story_concept_submission.sql` | EXACT |
| `20261105143656` | `migrations/0018_bridge_rights_ready_submission.sql` | NORMALIZED (whitespace/newline only) |

## Interpretation

- `EXACT` means byte-for-byte equality was reported against the repository file.
- `NORMALIZED` means equality after whitespace/newline normalization; retain this distinction.
- `ARCHIVED; no exact source file` means the applied SQL is preserved in the companion `.txt` evidence archive, not promoted into the executable migrations directory.
- The two `20261106_story_concept_buyer_mandates` records are distinct migrations with different SQL lengths and MD5 fingerprints; do not collapse them.
- No rollback SQL was recorded in the supplied reconciliation result (0 rollback entries).

## Next gate

Review each archived SQL statement for dependencies, object effects, privileges, RLS behavior, and compatibility with PR #171 before drafting any new executable migration. Do not apply any SQL as part of this evidence step.