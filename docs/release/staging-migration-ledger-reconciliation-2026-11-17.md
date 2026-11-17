# STAGING migration ledger reconciliation — 2026-11-17

## Environment and authority

| Environment | Project | Action | Access | Risk |
|---|---|---|---|---|
| STAGING / Testing DB | `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB, ap-south-1, PostgreSQL 17.11) | Read migration ledger and compare recorded versions to canonical Bridge Production manifest | READ-ONLY | Low operational risk; ledger snapshot can become stale |
| PRODUCTION DB | `mlmgugivsyoxzdgwkbpu` | No query or change in this reconciliation | NO ACTION; prior approved boundary remains READ-ONLY | High |

This is a documentation-only reconciliation. No SQL writes, migrations, `migration repair`, `db push`, DDL, grants, RLS changes, Auth operations, Data API calls, payment/refund actions, merge, deployment, or OCI changes occurred. ₹0.

## Executive result

- STAGING project status: ACTIVE_HEALTHY.
- STAGING recorded migration ledger: **61 entries**.
- Canonical Bridge Production source manifest (snapshot 2026-11-16): **69 entries**.
- Version overlap between the two ledgers: **0**.
- Conclusion: **FAIL — NOT A COMMON MIGRATION LINEAGE / NOT RECONCILED**.

The 69-entry manifest in `docs/release/bridge-supabase-migration-reconciliation-2026-11-16.md` is explicitly sourced from Production project `mlmgugivsyoxzdgwkbpu`. It must not be treated as the expected applied migration list for STAGING. STAGING has a separate test-specific migration history with different version identifiers and migration names. Zero matching versions does not prove schema divergence by itself; it proves that a direct version-ledger reconciliation cannot be declared PASS.

**Do not run `supabase db push`, `supabase migration repair`, or apply any Production-source migration to STAGING based on this comparison.** First build a semantic schema/object reconciliation from the current STAGING catalog, the 61 recorded STAGING migration SQL bodies, and the intended STAGING target contract.

## STAGING ledger — exact current entries

| # | Version | Recorded name |
|---:|---|---|
| 1 | `20261028180816` | `test_only_bridge_core_baseline_20261028` |
| 2 | `20261028180834` | `test_only_bridge_rls_20260921` |
| 3 | `20261028180856` | `test_only_bridge_assets_censor_certificate_20261004` |
| 4 | `20261028180900` | `test_only_bridge_commercial_engine_20261006230000` |
| 5 | `20261028180907` | `test_only_duplicate_title_reconciliation_20261028` |
| 6 | `20261028180912` | `test_only_harden_commercial_server_only_20261028` |
| 7 | `20261028180915` | `test_only_commercial_control_plane_20261028` |
| 8 | `20261028180918` | `test_only_financial_reversal_hardening_20261028` |
| 9 | `20261028180922` | `test_only_commercial_performance_indexes_20261028` |
| 10 | `20261028180926` | `test_only_story_concept_submission_20261028` |
| 11 | `20261029014139` | `test_bridge_workflow_schema_parity_20261029` |
| 12 | `20261029014203` | `test_censor_certificate_metadata_versions_20261029` |
| 13 | `20261030133503` | `testing_security_hardening_20261030` |
| 14 | `20261104203045` | `bridge_staging_data_api_lockdown_20261105` |
| 15 | `20261104203415` | `bridge_staging_function_execute_defaults_20261105` |
| 16 | `20261105084111` | `bridge_staging_identity_links_reconciliation_20261105` |
| 17 | `20261105143656` | `0018_bridge_rights_ready_submission` |
| 18 | `20261106025823` | `bridge_testing_workspace_rls_20261106` |
| 19 | `20261106025842` | `bridge_asset_storage_provenance_0022_20261106` |
| 20 | `20261106031604` | `bridge_titles_no_browser_update_policy_20261106` |
| 21 | `20261106031723` | `bridge_server_authoritative_uploads_0023_20261106` |
| 22 | `20261106032656` | `bridge_workspace_verified_identity_guard_20261106` |
| 23 | `20261106051631` | `story_concept_atomic_idempotency_testing_20261106` |
| 24 | `20261106063206` | `razorpay_webhook_processing_lease_schema` |
| 25 | `20261106083338` | `revenue_distribution_intelligence_20261106` |
| 26 | `20261106083617` | `20261106_story_concept_buyer_mandates` |
| 27 | `20261106084908` | `20261106_story_concept_buyer_mandates` |
| 28 | `20261108222208` | `grant_authenticated_usage_bridge_private_schema` |
| 29 | `20261109124007` | `staging_film_content_owner_leads_20261109` |
| 30 | `20261109134919` | `buyer_requirement_intelligence_private_20261109` |
| 31 | `20261109135114` | `buyer_requirement_foreign_key_indexes_20261109` |
| 32 | `20261110183356` | `staging_bridge_role_rpc_and_multi_studio_membership` |
| 33 | `20261110183454` | `loop_runtime_tables_and_atomic_tvod_fulfillment_staging` |
| 34 | `20261110183528` | `staging_server_only_deny_policies_and_loop_minimum_grants` |
| 35 | `20261110183943` | `loop_watch_progress_authenticated_own_rows_only` |
| 36 | `20261110184842` | `bridge_multi_studio_membership_lookup_index` |
| 37 | `20261110193739` | `bridge_rights_evidence_verification_0021_staging` |
| 38 | `20261111100344` | `loop_public_catalog_rpc` |
| 39 | `20261111100648` | `loop_tvod_entitlement_rpc` |
| 40 | `20261111101656` | `20261111101500_loop_public_catalog_and_tvod_entitlement_rpc` |
| 41 | `20261111101742` | `loop_rental_fulfillment_readiness` |
| 42 | `20261111102654` | `20261111102000_loop_rental_fulfillment_readiness` |
| 43 | `20261111110755` | `streamvista_customer_intake` |
| 44 | `20261111111042` | `streamvista_private_project_storage` |
| 45 | `20261111163440` | `buyer_acquisition_mandate_legal_scope_20261111` |
| 46 | `20261111163555` | `buyer_organization_legal_verification_20261111` |
| 47 | `20261114075718` | `bridge_dit_ingest_testing_20261114` |
| 48 | `20261114093221` | `bridge_site_content_cms_20261114` |
| 49 | `20261116082227` | `20261115220000_bridge_production_documents` |
| 50 | `20261116082234` | `20261115221000_bridge_production_owner_rls_helper` |
| 51 | `20261116082236` | `20261116083000_harden_bridge_title_owner_helper` |
| 52 | `20261116111314` | `secure_public_loop_catalog_testing` |
| 53 | `20261116111344` | `grant_public_loop_catalog_invoker_reads_testing` |
| 54 | `20261116111454` | `normalize_public_loop_catalog_schema_testing` |
| 55 | `20261116111631` | `restrict_public_loop_catalog_rpc_to_edge_service_testing` |\n| 56 | `20261116210822` | `bridge_title_hold_block_controls` |\n| 57 | `20261116224138` | `loop_viewer_profiles_20261117` |\n| 58 | `20261116224140` | `loop_watchlists_20261117` |\n| 59 | `20261116233444` | `streamvista_legacy_links_unresolved_resolution_state` |\n| 60 | `20261116234234` | `harden_legacy_links_service_role_privileges_20261117` |\n| 61 | `20261116234306` | `bridge_legal_consent_evidence_20261117` |

## Production manifest comparison

- Production manifest source: `docs/release/bridge-supabase-migration-reconciliation-2026-11-16.md`, pinned snapshot in the Bridge repository.
- Production manifest count: 69.
- STAGING ledger count: 61.
- Exact version overlap: 0.
- No attempt was made to compare or replay SQL bodies because the Production manifest is not the STAGING target and the full intended STAGING migration source set has not yet been independently pinned.

## What is confirmed about current STAGING schema

The connected Supabase project inventory lists public Bridge and Loop relations including:
- Bridge identity and workspace: `bridge_profiles`, `bridge_organizations`, `bridge_organization_memberships`, `bridge_loop_identity_links`.
- Bridge rights/production workflow: `bridge_titles`, `bridge_rights_grants`, `bridge_production_assets`, `bridge_dit_ingest_sessions`, `bridge_dit_ingest_files`, `bridge_dit_copy_verifications`.
- Loop runtime: `loop_titles`, `bridge_loop_publications`, `loop_plans`, `loop_subscriptions`, `loop_user_tvod_entitlements`, `loop_payment_events`, `loop_watch_progress`, `loop_media_migration_queue`.

The table inventory confirms RLS is enabled on listed public relations, but this is not proof that every policy, grant, function, trigger, constraint, index, storage policy, or edge function matches the intended design. The latest security advisor reports 15 RLS-enabled tables without policies, two authenticated-callable SECURITY DEFINER functions, and disabled leaked-password protection.

## Blockers before a PASS

1. Preserve the 61/61 applied SQL bodies recovered from read-only ledger queries and prior non-executable evidence archives; distinguish this from locating original migration files.
2. Obtain the authoritative intended STAGING schema contract; do not use the Production manifest as a substitute.
3. Produce a catalog inventory for tables/columns/types/defaults/constraints/FKs/indexes/views/functions/triggers/policies/grants/default ACLs/storage buckets and policies.
4. Map all 61 applied entries to original source files/commits; 10 exact and 1 normalized original source matches are already recorded; two additional ledger-exact applied-body copies are archived in PR #681; 48 original-source mappings remain unverified. For the later 24 entries, ledger-statement serialization byte counts and SHA-256 fingerprints are recorded in `staging-migration-source-sha256-followup-2026-11-17.md`; these are not original file hashes.
5. Compare the catalog to a disposable local replay of the STAGING migration set, not to Production.
6. Reconcile current object state against migration effects; separately identify intentional test fixtures and drift.
7. Review security advisor findings and test-only functions/policies.
8. Obtain independent human security review before requesting any STAGING write authorization.

## Status and next gate

| Gate | Status |
|---|---|
| STAGING project identity/status/version | PASS |
| STAGING migration ledger retrieved | PASS — 61 entries |
| Production source manifest retrieved | PASS — 69 entries |
| Direct ledger version match | FAIL — 0 matching versions |
| Applied STAGING SQL bodies preserved/retrieved | PASS — 61/61 |\n| Original source-file/commit mapping | PARTIAL — 11/61 original repository source mappings (10 exact, 1 normalized); 48 source mappings remain unverified after accounting for two separate ledger-exact recovered body copies in PR #681 |\n| Ledger-statement serialization fingerprints | PARTIAL — later 24 plus six latest records; not original file hashes |
| Intended STAGING schema contract pinned | BLOCKED |
| Full semantic catalog comparison | BLOCKED |
| Disposable replay of exact STAGING source | NOT RUN |
| Independent human security review | PENDING |

## No-change attestation

Only Supabase project metadata, migration listing, table listing and security/health advisor reads were used. No writes were performed. STAGING remains READ-ONLY. PRODUCTION remains HOLD / NOT CERTIFIED / NO-GO. This document is a draft evidence record, not authorization to apply migrations.
