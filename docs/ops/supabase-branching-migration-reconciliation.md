# Supabase Branching migration reconciliation — evidence report

**Snapshot commit:** `9c56a25e4eba2de63c4c261503112c8945b2dd5a`  
**Scope:** read-only inventory of remote migration history versus repository migration files.  
**Decision:** Production remediation NO-GO pending recovery and verification of canonical SQL. This report does not change either database or either migration ledger.

## Findings

- Production project `mlmgugivsyoxzdgwkbpu`: **52** remote migration records.
- Staging project `bbtrosuwisnxacuxvegt`: **33** remote migration records in this current read (earlier snapshots showed 30; staging has advanced).
- Repository `supabase/migrations/`: **9** SQL files at the inspected commit.
- Repository root `migrations/`: **25** numbered SQL files, used by the separate custom application migrator; these are not automatically a substitute for Supabase CLI migration files.
- Exact version match rule: a remote migration version must match the leading timestamp in a local `supabase/migrations/<version>_*.sql` filename. No such exact matches were found for the 52 Production records at this commit.
- Semantic filename similarity is not proof that SQL is identical to the originally applied migration. Do not copy/rename a root-level SQL file to a remote timestamp without verifying original SQL and schema effects.

## Production: version-by-version exact-match reconciliation

| Remote version | Remote name | Exact local `supabase/migrations` source | Status |
|---|---|---|---|
| `20260925141006` | `create_legacy_import_schema` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260925170237` | `bridge_auth_schema` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260925170239` | `bridge_operational_schema` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260925170241` | `bridge_webhook_retry` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260925170308` | `bridge_fk_indexes` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260925193451` | `bridge_webhook_processing_token` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260925214917` | `loop_canonical_runtime_baseline` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260925214936` | `loop_runtime_rls_and_plans` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260925220714` | `bridge_loop_verified_identity_links` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260926045625` | `loop_payment_events_own_read_policy` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260926054626` | `add_poster_studio_schema` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260927094608` | `harden_server_only_grants_and_fk_indexes` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260927114947` | `streamvista_media_os_service_pipeline` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260927215559` | `bridge_data_api_lockdown` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260927215742` | `bridge_buyer_title_access` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260927215758` | `bridge_buyer_title_access_20260928` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260928102539` | `bridge_profile_welcome_email_marker` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260928120120` | `bridge_prd_phase1` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260928154653` | `bridge_auth_protected_read_policies` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260929154225` | `bind_bridge_rls_identity_and_read_scope` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260929162737` | `harden_bridge_rls_helpers_rpc_surface` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20260930092721` | `grant_authenticated_bridge_current_internal_role` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261002171708` | `loop_release_safety` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261004051643` | `loop_semantic_search` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261004052641` | `move_vector_to_extensions_schema` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261004052646` | `rebind_loop_semantic_rpc_vector_schema` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261004102348` | `delivery_trace_finance` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261005112318` | `investor_account_type_20261005` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261005124904` | `bridge_dmca` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261005125643` | `lock_down_bridge_client_grants` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261005125847` | `explicit_deny_policies_for_internal_tables` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261006100425` | `allow_bridge_supabase_auth_onboarding_verification` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261006152111` | `bridge_buyer_publication_gates` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261006154551` | `harden_authz_server_only_surfaces_20261006` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261006154553` | `legacy_creator_intake_20261006` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261006185556` | `bridge_commercial_engine_20261006230000` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261006185640` | `harden_bridge_commercial_server_only_20261007000000` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261006195531` | `bridge_commercial_control_plane_20261007013000` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261006195536` | `bridge_financial_reversal_hardening_20261007020000` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261006195607` | `bridge_commercial_performance_indexes_20261007023000` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261006231321` | `deep_clean_server_only_rls_20261007` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261008031103` | `loop_watchlists_20261008` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261008050017` | `p0_bridge_catalog_deal_room_reconciliation_20261008` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261008053655` | `p0_bridge_catalog_deal_room_reconciliation_v2` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261008053658` | `p0_bridge_title_catalog_columns_v2` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261008053700` | `p0_loop_catalog_pranayam_visibility_v2` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261008113911` | `reconcile_duplicate_title_merge_gate_20261008` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261008122836` | `enable_merge_table_rls` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261009210503` | `bridge_rights_ready_submission` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261009210645` | `bridge_submission_intake_server_only` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261011041046` | `bridge_storage_economics_20261011` | None at inspected commit | **MISSING EXACT SOURCE** |
| `20261016161255` | `bridge_assets_kind_constraint_20261016` | None at inspected commit | **MISSING EXACT SOURCE** |

## Existing Supabase CLI migration files at inspected commit

| Local file | Leading version | Exact match in Production history? |
|---|---:|---|
| `20260921_crayons_bridge_rls.sql` | `20260921` | No |
| `20261004_bridge_assets_add_censor_certificate.sql` | `20261004` | No |
| `20261006170000_reconcile_duplicate_bridge_titles.sql` | `20261006170000` | No |
| `20261006230000_bridge_commercial_engine.sql` | `20261006230000` | No |
| `20261006230000_duplicate_title_reconciliation.sql` | `20261006230000` | No |
| `20261007000000_harden_bridge_commercial_server_only.sql` | `20261007000000` | No |
| `20261007013000_bridge_commercial_control_plane.sql` | `20261007013000` | No |
| `20261007020000_bridge_financial_reversal_hardening.sql` | `20261007020000` | No |
| `20261007023000_bridge_commercial_performance_indexes.sql` | `20261007023000` | No |

## Root-level custom application migrations (not a Supabase CLI mapping)

The root `migrations/` directory contains these numbered SQL files. They are relevant historical source candidates, but none may be declared equivalent to a remote timestamped migration without a reviewed SQL diff and provenance.

- `0001_auth.sql`
- `0002_cinema.sql`
- `0003_ops.sql`
- `0004_bridge.sql`
- `0005_bridge_webhook_retry.sql`
- `0006_loop_canonical.sql`
- `0007_streamvista_media_os.sql`
- `0007a_identity_links.sql`
- `0008_bridge_data_api_lockdown.sql`
- `0009_buyer_title_access.sql`
- `0010_bridge_prd_phase1.sql`
- `0011_bridge_dmca.sql`
- `0012_bridge_rls_identity_binding.sql`
- `0013_harden_bridge_rls_helpers.sql`
- `0014_bridge_site_content.sql`
- `0015_delivery_trace_finance.sql`
- `0016_investor_account_type.sql`
- `0017_bridge_buyer_publication_gates.sql`
- `0018_bridge_rights_ready_submission.sql`
- `0018_bridge_service_revenue_engine.sql`
- `0018_multilingual_rights_mvp.sql`
- `0018_rights_ready_public_submission.sql`
- `0019_bridge_service_tax_rates.sql`
- `0020_bridge_digital_theatrical_delivery.sql`
- `0020_duplicate_title_merge_gate.sql`

## Staging history (separate target; not a Production substitute)

| Remote version | Remote name | Exact local `supabase/migrations` source |
|---|---|---|
| `20261012222532` | `staging_0001_auth` | None at inspected commit |
| `20261012222536` | `staging_0002_cinema` | None at inspected commit |
| `20261012222539` | `staging_0003_ops` | None at inspected commit |
| `20261012222543` | `staging_0004_bridge` | None at inspected commit |
| `20261012222550` | `staging_0006_loop_canonical` | None at inspected commit |
| `20261012222554` | `staging_0007_streamvista_media_os` | None at inspected commit |
| `20261012222557` | `staging_0007a_identity_links` | None at inspected commit |
| `20261012222600` | `staging_0008_bridge_data_api_lockdown` | None at inspected commit |
| `20261012222604` | `staging_0009_buyer_title_access` | None at inspected commit |
| `20261012222612` | `staging_0010_bridge_prd_phase1` | None at inspected commit |
| `20261012222616` | `staging_0011_bridge_dmca` | None at inspected commit |
| `20261012222619` | `staging_0012_bridge_rls_identity_binding` | None at inspected commit |
| `20261012222623` | `staging_0013_harden_bridge_rls_helpers` | None at inspected commit |
| `20261012222629` | `staging_0014_bridge_site_content` | None at inspected commit |
| `20261012222634` | `staging_0015_delivery_trace_finance` | None at inspected commit |
| `20261012222638` | `staging_0016_investor_account_type` | None at inspected commit |
| `20261012222641` | `staging_0017_bridge_buyer_publication_gates` | None at inspected commit |
| `20261012222654` | `staging_0018_bridge_rights_ready_submission` | None at inspected commit |
| `20261012222658` | `staging_0018_bridge_service_revenue_engine` | None at inspected commit |
| `20261012222702` | `staging_0018_multilingual_rights_mvp` | None at inspected commit |
| `20261012222705` | `staging_0018_rights_ready_public_submission` | None at inspected commit |
| `20261012222712` | `staging_0019_bridge_service_tax_rates` | None at inspected commit |
| `20261012222717` | `staging_0020_bridge_digital_theatrical_delivery` | None at inspected commit |
| `20261012222720` | `staging_0020_duplicate_title_merge_gate` | None at inspected commit |
| `20261012223629` | `staging_bridge_webhook_retry_20261013` | None at inspected commit |
| `20261015045346` | `bridge_accepted_deal_payment_20261015` | None at inspected commit |
| `20261015045931` | `bridge_deal_tables_restrict_client_grants` | None at inspected commit |
| `20261015050250` | `bridge_data_api_lockdown_staging_20261015` | None at inspected commit |
| `20261018122313` | `lock_down_legacy_auth_tables_staging` | None at inspected commit |
| `20261019200358` | `staging_public_rls_lockdown_20261020` | None at inspected commit |
| `20261021220325` | `revoke_public_client_privileges_bridge_title_submission_intake` | None at inspected commit |
| `20261021220346` | `explicit_deny_client_access_bridge_title_submission_intake` | None at inspected commit |
| `20261021220723` | `harden_staging_public_acl_and_buyer_gate_search_path` | None at inspected commit |

## Safe implementation plan

1. Recover the authoritative original SQL for each Production remote version from the source that created/applied it (historical commits, release artifacts, or controlled `db pull`/schema-diff evidence).
2. For each version, record source provenance, SQL checksum, object-level effects, and whether it is represented by any root-level custom migration. Require human review for any inferred mapping.
3. Restore only verified canonical SQL files into `supabase/migrations/` using the exact original version prefix. Do not synthesize empty placeholders or rewrite remote history to suppress the error.
4. Validate the complete migration set in an isolated local Supabase stack and then against the dedicated Staging project after confirming the target project ID. Do not apply migrations to Production as part of this repair.
5. Re-run the Branching workflow only after the local migration versions are complete and the Preview/branching target is confirmed to be Staging.

## Safety / release gate

- No SQL was applied; no migration history was repaired or rewritten; no Production workflow was retriggered by this report.
- **Production: NO-GO / NOT CERTIFIED.** This is an evidence artifact, not a database fix.
- Staging and Production histories differ and must remain separately reconciled.
