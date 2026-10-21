# Supabase Branching migration reconciliation — version-by-version evidence

**Repository snapshot:** `9c56a25e4eba2de63c4c261503112c8945b2dd5a` (main).
**Read-only history snapshot:** Production `52` rows; Staging `33` rows. Staging is a separate project, not a substitute for Production history.
**Outcome:** Complete inventory; exact original-SQL mapping remains incomplete because the inspected repository has no corresponding timestamp-prefixed file for any Production version.

## Interpretation

The table is complete for the Production migration-history rows returned by Supabase. A candidate below means name/topic resemblance only, not proof that the file is the original SQL applied. Original-source status remains **UNVERIFIED** for every row. No files are renamed or recreated from guesses.

## Production version-by-version table

| Remote version | Remote migration name | Exact `supabase/migrations/<version>_*.sql` | Existing source candidate | Status |
|---|---|---|---|---|
| `20260925141006` | `create_legacy_import_schema` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260925170237` | `bridge_auth_schema` | **None** | migrations/0001_auth.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260925170239` | `bridge_operational_schema` | **None** | migrations/0004_bridge.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260925170241` | `bridge_webhook_retry` | **None** | migrations/0005_bridge_webhook_retry.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260925170308` | `bridge_fk_indexes` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260925193451` | `bridge_webhook_processing_token` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260925214917` | `loop_canonical_runtime_baseline` | **None** | migrations/0006_loop_canonical.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260925214936` | `loop_runtime_rls_and_plans` | **None** | migrations/0006_loop_canonical.sql (possible overlap; unverified) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260925220714` | `bridge_loop_verified_identity_links` | **None** | migrations/0007a_identity_links.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260926045625` | `loop_payment_events_own_read_policy` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260926054626` | `add_poster_studio_schema` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260927094608` | `harden_server_only_grants_and_fk_indexes` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260927114947` | `streamvista_media_os_service_pipeline` | **None** | migrations/0007_streamvista_media_os.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260927215559` | `bridge_data_api_lockdown` | **None** | migrations/0008_bridge_data_api_lockdown.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260927215742` | `bridge_buyer_title_access` | **None** | migrations/0009_buyer_title_access.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260927215758` | `bridge_buyer_title_access_20260928` | **None** | migrations/0009_buyer_title_access.sql (variant; unverified) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260928102539` | `bridge_profile_welcome_email_marker` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260928120120` | `bridge_prd_phase1` | **None** | migrations/0010_bridge_prd_phase1.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260928154653` | `bridge_auth_protected_read_policies` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260929154225` | `bind_bridge_rls_identity_and_read_scope` | **None** | migrations/0012_bridge_rls_identity_binding.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260929162737` | `harden_bridge_rls_helpers_rpc_surface` | **None** | migrations/0013_harden_bridge_rls_helpers.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20260930092721` | `grant_authenticated_bridge_current_internal_role` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261002171708` | `loop_release_safety` | **None** | migrations/0020_duplicate_title_merge_gate.sql (possible overlap; unverified) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261004051643` | `loop_semantic_search` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261004052641` | `move_vector_to_extensions_schema` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261004052646` | `rebind_loop_semantic_rpc_vector_schema` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261004102348` | `delivery_trace_finance` | **None** | migrations/0015_delivery_trace_finance.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261005112318` | `investor_account_type_20261005` | **None** | migrations/0016_investor_account_type.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261005124904` | `bridge_dmca` | **None** | migrations/0011_bridge_dmca.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261005125643` | `lock_down_bridge_client_grants` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261005125847` | `explicit_deny_policies_for_internal_tables` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261006100425` | `allow_bridge_supabase_auth_onboarding_verification` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261006152111` | `bridge_buyer_publication_gates` | **None** | migrations/0017_bridge_buyer_publication_gates.sql (semantic only) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261006154551` | `harden_authz_server_only_surfaces_20261006` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261006154553` | `legacy_creator_intake_20261006` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261006185556` | `bridge_commercial_engine_20261006230000` | **None** | supabase/migrations/20261006230000_bridge_commercial_engine.sql; migrations/0018_bridge_service_revenue_engine.sql (timestamp differs; unverified) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261006185640` | `harden_bridge_commercial_server_only_20261007000000` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261006195531` | `bridge_commercial_control_plane_20261007013000` | **None** | supabase/migrations/20261007013000_bridge_commercial_control_plane.sql (timestamp differs; unverified) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261006195536` | `bridge_financial_reversal_hardening_20261007020000` | **None** | supabase/migrations/20261007020000_bridge_financial_reversal_hardening.sql (timestamp differs; unverified) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261006195607` | `bridge_commercial_performance_indexes_20261007023000` | **None** | supabase/migrations/20261007023000_bridge_commercial_performance_indexes.sql (timestamp differs; unverified) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261006231321` | `deep_clean_server_only_rls_20261007` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261008031103` | `loop_watchlists_20261008` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261008050017` | `p0_bridge_catalog_deal_room_reconciliation_20261008` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261008053655` | `p0_bridge_catalog_deal_room_reconciliation_v2` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261008053658` | `p0_bridge_title_catalog_columns_v2` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261008053700` | `p0_loop_catalog_pranayam_visibility_v2` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261008113911` | `reconcile_duplicate_title_merge_gate_20261008` | **None** | supabase/migrations/20261006170000_reconcile_duplicate_bridge_titles.sql; migrations/0020_duplicate_title_merge_gate.sql (possible overlap; unverified) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261008122836` | `enable_merge_table_rls` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261009210503` | `bridge_rights_ready_submission` | **None** | migrations/0018_bridge_rights_ready_submission.sql; migrations/0018_rights_ready_public_submission.sql (two candidates; no canonical match) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261009210645` | `bridge_submission_intake_server_only` | **None** | migrations/0018_bridge_rights_ready_submission.sql; migrations/0018_rights_ready_public_submission.sql (possible related source; unverified) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261011041046` | `bridge_storage_economics_20261011` | **None** | migrations/0018_bridge_service_revenue_engine.sql; migrations/0019_bridge_service_tax_rates.sql (unverified; no same-name SQL) | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |
| `20261016161255` | `bridge_assets_kind_constraint_20261016` | **None** | None established | **SOURCE NOT RECOVERED** — no exact timestamped local file; original applied SQL payload and SHA-256 not recovered. |

## Existing source files

### `supabase/migrations/` — 9 SQL files
- [`supabase/migrations/20260921_crayons_bridge_rls.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/supabase/migrations/20260921_crayons_bridge_rls.sql)
- [`supabase/migrations/20261004_bridge_assets_add_censor_certificate.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/supabase/migrations/20261004_bridge_assets_add_censor_certificate.sql)
- [`supabase/migrations/20261006170000_reconcile_duplicate_bridge_titles.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/supabase/migrations/20261006170000_reconcile_duplicate_bridge_titles.sql)
- [`supabase/migrations/20261006230000_bridge_commercial_engine.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/supabase/migrations/20261006230000_bridge_commercial_engine.sql)
- [`supabase/migrations/20261006230000_duplicate_title_reconciliation.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/supabase/migrations/20261006230000_duplicate_title_reconciliation.sql)
- [`supabase/migrations/20261007000000_harden_bridge_commercial_server_only.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/supabase/migrations/20261007000000_harden_bridge_commercial_server_only.sql)
- [`supabase/migrations/20261007013000_bridge_commercial_control_plane.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/supabase/migrations/20261007013000_bridge_commercial_control_plane.sql)
- [`supabase/migrations/20261007020000_bridge_financial_reversal_hardening.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/supabase/migrations/20261007020000_bridge_financial_reversal_hardening.sql)
- [`supabase/migrations/20261007023000_bridge_commercial_performance_indexes.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/supabase/migrations/20261007023000_bridge_commercial_performance_indexes.sql)

### Root `migrations/` — 25 SQL files
The custom application migrator uses this root-level collection. These files are not automatically substitutes for Supabase CLI timestamped migrations.
- [`migrations/0001_auth.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0001_auth.sql)
- [`migrations/0002_cinema.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0002_cinema.sql)
- [`migrations/0003_ops.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0003_ops.sql)
- [`migrations/0004_bridge.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0004_bridge.sql)
- [`migrations/0005_bridge_webhook_retry.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0005_bridge_webhook_retry.sql)
- [`migrations/0006_loop_canonical.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0006_loop_canonical.sql)
- [`migrations/0007_streamvista_media_os.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0007_streamvista_media_os.sql)
- [`migrations/0007a_identity_links.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0007a_identity_links.sql)
- [`migrations/0008_bridge_data_api_lockdown.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0008_bridge_data_api_lockdown.sql)
- [`migrations/0009_buyer_title_access.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0009_buyer_title_access.sql)
- [`migrations/0010_bridge_prd_phase1.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0010_bridge_prd_phase1.sql)
- [`migrations/0011_bridge_dmca.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0011_bridge_dmca.sql)
- [`migrations/0012_bridge_rls_identity_binding.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0012_bridge_rls_identity_binding.sql)
- [`migrations/0013_harden_bridge_rls_helpers.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0013_harden_bridge_rls_helpers.sql)
- [`migrations/0014_bridge_site_content.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0014_bridge_site_content.sql)
- [`migrations/0015_delivery_trace_finance.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0015_delivery_trace_finance.sql)
- [`migrations/0016_investor_account_type.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0016_investor_account_type.sql)
- [`migrations/0017_bridge_buyer_publication_gates.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0017_bridge_buyer_publication_gates.sql)
- [`migrations/0018_bridge_rights_ready_submission.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0018_bridge_rights_ready_submission.sql)
- [`migrations/0018_bridge_service_revenue_engine.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0018_bridge_service_revenue_engine.sql)
- [`migrations/0018_multilingual_rights_mvp.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0018_multilingual_rights_mvp.sql)
- [`migrations/0018_rights_ready_public_submission.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0018_rights_ready_public_submission.sql)
- [`migrations/0019_bridge_service_tax_rates.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0019_bridge_service_tax_rates.sql)
- [`migrations/0020_bridge_digital_theatrical_delivery.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0020_bridge_digital_theatrical_delivery.sql)
- [`migrations/0020_duplicate_title_merge_gate.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/9c56a25e4eba2de63c4c261503112c8945b2dd5a/migrations/0020_duplicate_title_merge_gate.sql)

## Missing and divergent files

- **52/52 Production versions:** no exact timestamp-prefixed file found in `supabase/migrations/` at the inspected main commit.
- **Potential candidates requiring original-source verification:**
  - `20260925170237 bridge_auth_schema` → migrations/0001_auth.sql (semantic only).
  - `20260925170239 bridge_operational_schema` → migrations/0004_bridge.sql (semantic only).
  - `20260925170241 bridge_webhook_retry` → migrations/0005_bridge_webhook_retry.sql (semantic only).
  - `20260925214917 loop_canonical_runtime_baseline` → migrations/0006_loop_canonical.sql (semantic only).
  - `20260925214936 loop_runtime_rls_and_plans` → migrations/0006_loop_canonical.sql (possible overlap; unverified).
  - `20260925220714 bridge_loop_verified_identity_links` → migrations/0007a_identity_links.sql (semantic only).
  - `20260927114947 streamvista_media_os_service_pipeline` → migrations/0007_streamvista_media_os.sql (semantic only).
  - `20260927215559 bridge_data_api_lockdown` → migrations/0008_bridge_data_api_lockdown.sql (semantic only).
  - `20260927215742 bridge_buyer_title_access` → migrations/0009_buyer_title_access.sql (semantic only).
  - `20260927215758 bridge_buyer_title_access_20260928` → migrations/0009_buyer_title_access.sql (variant; unverified).
  - `20260928120120 bridge_prd_phase1` → migrations/0010_bridge_prd_phase1.sql (semantic only).
  - `20260929154225 bind_bridge_rls_identity_and_read_scope` → migrations/0012_bridge_rls_identity_binding.sql (semantic only).
  - `20260929162737 harden_bridge_rls_helpers_rpc_surface` → migrations/0013_harden_bridge_rls_helpers.sql (semantic only).
  - `20261002171708 loop_release_safety` → migrations/0020_duplicate_title_merge_gate.sql (possible overlap; unverified).
  - `20261004102348 delivery_trace_finance` → migrations/0015_delivery_trace_finance.sql (semantic only).
  - `20261005112318 investor_account_type_20261005` → migrations/0016_investor_account_type.sql (semantic only).
  - `20261005124904 bridge_dmca` → migrations/0011_bridge_dmca.sql (semantic only).
  - `20261006152111 bridge_buyer_publication_gates` → migrations/0017_bridge_buyer_publication_gates.sql (semantic only).
  - `20261006185556 bridge_commercial_engine_20261006230000` → supabase/migrations/20261006230000_bridge_commercial_engine.sql; migrations/0018_bridge_service_revenue_engine.sql (timestamp differs; unverified).
  - `20261006195531 bridge_commercial_control_plane_20261007013000` → supabase/migrations/20261007013000_bridge_commercial_control_plane.sql (timestamp differs; unverified).
  - `20261006195536 bridge_financial_reversal_hardening_20261007020000` → supabase/migrations/20261007020000_bridge_financial_reversal_hardening.sql (timestamp differs; unverified).
  - `20261006195607 bridge_commercial_performance_indexes_20261007023000` → supabase/migrations/20261007023000_bridge_commercial_performance_indexes.sql (timestamp differs; unverified).
  - `20261008113911 reconcile_duplicate_title_merge_gate_20261008` → supabase/migrations/20261006170000_reconcile_duplicate_bridge_titles.sql; migrations/0020_duplicate_title_merge_gate.sql (possible overlap; unverified).
  - `20261009210503 bridge_rights_ready_submission` → migrations/0018_bridge_rights_ready_submission.sql; migrations/0018_rights_ready_public_submission.sql (two candidates; no canonical match).
  - `20261009210645 bridge_submission_intake_server_only` → migrations/0018_bridge_rights_ready_submission.sql; migrations/0018_rights_ready_public_submission.sql (possible related source; unverified).
  - `20261011041046 bridge_storage_economics_20261011` → migrations/0018_bridge_service_revenue_engine.sql; migrations/0019_bridge_service_tax_rates.sql (unverified; no same-name SQL).
- **No candidate established from current inventory:**
  - `20260925141006 create_legacy_import_schema`
  - `20260925170308 bridge_fk_indexes`
  - `20260925193451 bridge_webhook_processing_token`
  - `20260926045625 loop_payment_events_own_read_policy`
  - `20260926054626 add_poster_studio_schema`
  - `20260927094608 harden_server_only_grants_and_fk_indexes`
  - `20260928102539 bridge_profile_welcome_email_marker`
  - `20260928154653 bridge_auth_protected_read_policies`
  - `20260930092721 grant_authenticated_bridge_current_internal_role`
  - `20261004051643 loop_semantic_search`
  - `20261004052641 move_vector_to_extensions_schema`
  - `20261004052646 rebind_loop_semantic_rpc_vector_schema`
  - `20261005125643 lock_down_bridge_client_grants`
  - `20261005125847 explicit_deny_policies_for_internal_tables`
  - `20261006100425 allow_bridge_supabase_auth_onboarding_verification`
  - `20261006154551 harden_authz_server_only_surfaces_20261006`
  - `20261006154553 legacy_creator_intake_20261006`
  - `20261006185640 harden_bridge_commercial_server_only_20261007000000`
  - `20261006231321 deep_clean_server_only_rls_20261007`
  - `20261008031103 loop_watchlists_20261008`
  - `20261008050017 p0_bridge_catalog_deal_room_reconciliation_20261008`
  - `20261008053655 p0_bridge_catalog_deal_room_reconciliation_v2`
  - `20261008053658 p0_bridge_title_catalog_columns_v2`
  - `20261008053700 p0_loop_catalog_pranayam_visibility_v2`
  - `20261008122836 enable_merge_table_rls`
  - `20261016161255 bridge_assets_kind_constraint_20261016`
- **Duplicate local timestamp prefix:** `20261006230000_bridge_commercial_engine.sql` and `20261006230000_duplicate_title_reconciliation.sql` share one prefix; investigate before Supabase CLI use.
- **Root numbering divergence:** multiple `0018_*` and `0020_*` files make basename-only matching ambiguous.
- **Timestamp divergence:** several local timestamped commercial SQL files have versions that do not exactly match the related Production history entries; similar names do not justify relabeling or duplication.

## Staging history — separate ledger

| Remote version | Staging migration name | Exact local file |
|---|---|---|
| `20261012222532` | `staging_0001_auth` | None |
| `20261012222536` | `staging_0002_cinema` | None |
| `20261012222539` | `staging_0003_ops` | None |
| `20261012222543` | `staging_0004_bridge` | None |
| `20261012222550` | `staging_0006_loop_canonical` | None |
| `20261012222554` | `staging_0007_streamvista_media_os` | None |
| `20261012222557` | `staging_0007a_identity_links` | None |
| `20261012222600` | `staging_0008_bridge_data_api_lockdown` | None |
| `20261012222604` | `staging_0009_buyer_title_access` | None |
| `20261012222612` | `staging_0010_bridge_prd_phase1` | None |
| `20261012222616` | `staging_0011_bridge_dmca` | None |
| `20261012222619` | `staging_0012_bridge_rls_identity_binding` | None |
| `20261012222623` | `staging_0013_harden_bridge_rls_helpers` | None |
| `20261012222629` | `staging_0014_bridge_site_content` | None |
| `20261012222634` | `staging_0015_delivery_trace_finance` | None |
| `20261012222638` | `staging_0016_investor_account_type` | None |
| `20261012222641` | `staging_0017_bridge_buyer_publication_gates` | None |
| `20261012222654` | `staging_0018_bridge_rights_ready_submission` | None |
| `20261012222658` | `staging_0018_bridge_service_revenue_engine` | None |
| `20261012222702` | `staging_0018_multilingual_rights_mvp` | None |
| `20261012222705` | `staging_0018_rights_ready_public_submission` | None |
| `20261012222712` | `staging_0019_bridge_service_tax_rates` | None |
| `20261012222717` | `staging_0020_bridge_digital_theatrical_delivery` | None |
| `20261012222720` | `staging_0020_duplicate_title_merge_gate` | None |
| `20261012223629` | `staging_bridge_webhook_retry_20261013` | None |
| `20261015045346` | `bridge_accepted_deal_payment_20261015` | None |
| `20261015045931` | `bridge_deal_tables_restrict_client_grants` | None |
| `20261015050250` | `bridge_data_api_lockdown_staging_20261015` | None |
| `20261018122313` | `lock_down_legacy_auth_tables_staging` | None |
| `20261019200358` | `staging_public_rls_lockdown_20261020` | None |
| `20261021220325` | `revoke_public_client_privileges_bridge_title_submission_intake` | None |
| `20261021220346` | `explicit_deny_client_access_bridge_title_submission_intake` | None |
| `20261021220723` | `harden_staging_public_acl_and_buyer_gate_search_path` | None |

## Source-recovery evidence

- Recursive GitHub tree inspection confirms the two migration collections above, but does not reveal timestamped source files for the Production versions.
- Git history contains related feature commits but does not prove the original SQL payload for each remote version.
- Example: commit `90684bc601ad21c57290203b7a0fb78dec286cd0` relates to rights-ready submission, but its inspected tree does not contain `20261009210503_bridge_rights_ready_submission.sql`; this is not a verified source match.

## Safe next actions

1. Recover original SQL from migration-authoring/deployment artifacts and preserve provenance plus checksums.
2. Compare each candidate with authoritative SQL and schema evidence; record exact match, divergence, or missing source for every version.
3. Resolve duplicate timestamp prefix and the custom-migrator/Supabase-CLI separation in a reviewed change.
4. Validate on an isolated local stack, then the intended Staging project. Do not apply migrations or rewrite history in Production.
5. Retrigger Branching only after exact local files and target project are verified.

## Release gate

**Production: NO-GO / NOT CERTIFIED.** This is a complete inventory but not a claim that the Branching error is fixed. No database writes, migration-ledger changes, or Production workflow retrigger occurred.


## Source-recovery pass 1 — Git commit evidence (2026-10-22)

This pass inspected the two rights-ready feature commits directly, including their changed-file patches. It recovered authoritative *repository source candidates* for the rights-ready feature, but it did **not** prove that either file is byte-for-byte the SQL payload originally applied for a Production ledger version.

| Source artifact | Provenance evidence | What is established | What remains unproven |
|---|---|---|---|
| `migrations/0018_bridge_rights_ready_submission.sql` | Commit [`90684bc601ad21c57290203b7a0fb78dec286cd0`](https://github.com/picturecrayons-cyber/Media-Factory/commit/90684bc601ad21c57290203b7a0fb78dec286cd0), added as a 40-line SQL file in the commit patch | Git history contains the source SQL that creates `bridge_title_submission_intake`, its updated-at index, and enables RLS. | It is not a timestamped Supabase CLI file; the commit patch alone does not prove it was the exact payload recorded as Production version `20261009210503` or `20261009210645`. |
| `migrations/0018_rights_ready_public_submission.sql` | Commit [`6c51ce89adb94eba76c8b111b789b3f7c316ad98`](https://github.com/picturecrayons-cyber/Media-Factory/commit/6c51ce89adb94eba76c8b111b789b3f7c316ad98), added as a 16-line SQL file in the commit patch | Git history contains a separate source SQL adding `rights_submission_status`, its index/comment, and RLS on rights/legal/package tables. | This is a distinct file with overlapping product area, not proof of the SQL payload for either Production rights-ready version. |
| Production `20261009210503 bridge_rights_ready_submission` | Remote ledger row from the prior read-only history snapshot; related feature commits above | Two plausible source files exist in repository history and have distinguishable SQL content. | **SOURCE NOT RECOVERED as an exact applied payload**; no verified timestamped file, deployment artifact, SQL checksum, or authoritative link to the original applied text is recorded yet. |
| Production `20261009210645 bridge_submission_intake_server_only` | Remote ledger row from the prior read-only history snapshot; related feature commits above | The feature's source history contains an intake table and related application code. | **SOURCE NOT RECOVERED as an exact applied payload**; no evidence yet isolates the exact server-only hardening SQL applied under this version. |

### Provenance and checksum policy

- Keep the remote migration version/name separate from the repository path and source commit. A matching feature name is not an identity match.
- A source is **EXACT MATCH** only when an authoritative original SQL artifact is recovered and its content can be compared byte-for-byte (or normalized only under a documented, reviewed normalization rule) with the candidate.
- Record SHA-256 for the recovered SQL bytes and the evidence location. A Git commit SHA identifies a commit, not the SQL file bytes by itself; use the file blob/content or a verified artifact checksum for content identity.
- Until that evidence is available, use **SOURCE NOT RECOVERED** or **CANDIDATE — NOT VERIFIED**, never infer or synthesize SQL from the current schema.
- Do not mark the Branching failure fixed from these findings. No database writes, ledger edits, migration application, or Production workflow retry were performed during this recovery pass.

### Next recovery targets

Prioritize the remaining versions with no candidate, then the versions with plausible candidates. Search source-control history and CI/deployment artifacts for the original SQL payloads and record exact artifact provenance. If the original payload cannot be recovered, preserve that as an explicit unresolved gap rather than manufacturing a timestamped migration.


## Source-recovery pass 2 — current ledger and candidate artifact identity (2026-10-22)

### Current read-only ledger recheck

A fresh read through the connected Supabase migration-list operation returned the same version inventory counts and records as the earlier snapshot:

- Production project `mlmgugivsyoxzdgwkbpu`: **52** migration records, latest listed version `20261016161255`.
- Staging project `bbtrosuwisnxacuxvegt`: **33** migration records, latest listed version `20261021220723`.
- Staging has later staging-specific hardening entries that are not in the Production ledger. The histories are different and must not be reconciled by copying one ledger over the other.

This was a read-only metadata check; no SQL was executed and no migration operation was invoked.

### Candidate Git blob identities

The following are current `main` branch file identities, captured from GitHub's contents API. A Git blob SHA identifies the exact Git blob object, not the SHA-256 checksum of a remote migration payload. These identities help pin the candidates under review; they **do not** establish that the remote payload matches.

| Candidate file | Git blob SHA | Character count returned | Candidate relationship |
|---|---|---:|---|
| `migrations/0001_auth.sql` | `08c6b01fef9b46e72470fb66ea967d5f84e9bdb5` | 2733 | Semantic candidate for `20260925170237 bridge_auth_schema`; not an exact source match |
| `migrations/0004_bridge.sql` | `3ddc50742490c102e08e8a123aec203ef0188d8d` | 4599 | Semantic candidate for `20260925170239 bridge_operational_schema`; not an exact source match |
| `migrations/0005_bridge_webhook_retry.sql` | `a6c3cda87d8293fb4e2b881f5636cc9dd77a4146` | 309 | Semantic candidate for `20260925170241 bridge_webhook_retry`; not an exact source match |
| `migrations/0018_bridge_rights_ready_submission.sql` | `b788e9ab35ac1d61d98f644f268a4708b31e6ffd` | 1477 | Repository source candidate; exact Production payload unresolved |
| `migrations/0018_rights_ready_public_submission.sql` | `ae50b68b123cfea470da0b68d939b828f2a74d1a` | 970 | Distinct repository source candidate; exact Production payload unresolved |
| `supabase/migrations/20261006230000_bridge_commercial_engine.sql` | `cd303761295770ec63ec9421b403a65e804db66a` | 28612 | Timestamp does not equal Production version `20261006185556`; not an exact match |
| `supabase/migrations/20261007013000_bridge_commercial_control_plane.sql` | `e5710413945137ac471319ada82d1a129e0545e0` | 6907 | Timestamp does not equal Production version `20261006195531`; not an exact match |
| `supabase/migrations/20261007020000_bridge_financial_reversal_hardening.sql` | `f05972a592ca4569d161ddd8f6c43cc0517f69d5` | 702 | Timestamp does not equal Production version `20261006195536`; not an exact match |
| `supabase/migrations/20261007023000_bridge_commercial_performance_indexes.sql` | `2f2fd8b30ade126891a0e4a1621ad7084727c182` | 809 | Timestamp does not equal Production version `20261006195607`; not an exact match |

### Historical search result and boundary

Targeted Git commit searches and repository file searches for the names of migrations without a candidate (including legacy import schema, FK indexes, webhook processing token, poster studio schema, semantic search/vector changes, merge-table RLS, storage economics, and asset-kind constraint) returned no matching source results through the connected search interface in this pass. This is **not proof that the SQL never existed**; it means the source has not been recovered by those searches. Deployment artifacts or another authoritative history source may still contain it.

No SHA-256 checksums of original remote migration payloads can be supplied until those payloads are recovered. Do not substitute Git blob IDs for SHA-256 checksums, and do not promote a semantic candidate to an exact match without comparing the authoritative payload.

### Current gate

**Source reconciliation remains INCOMPLETE. Production remains NO-GO / NOT CERTIFIED.** No Production or Staging database writes, migration-ledger changes, branch reset/rebase/merge, or Branching workflow retry were performed in this pass.


## Source-recovery pass 3 — connected-source review (2026-10-22)

This pass reviewed GitHub history and PR patches, Vercel deployment metadata, read-only Supabase migration inventories, and targeted Hostinger Mail searches. No Production database writes, migration applications, ledger edits, payment actions, OCI operations, merges, or deployment promotions were performed.

### Historical candidate sources found — not exact remote payload recovery

| Remote Production version/name | Candidate source located | Why it is still not certified as the applied payload |
|---|---|---|
| `20261011041046 bridge_storage_economics_20261011` | [PR #173 patch](https://github.com/picturecrayons-cyber/Media-Factory/pull/173) and [PR #208 patch](https://github.com/picturecrayons-cyber/Media-Factory/pull/208) contain `migrations/20261008165000_bridge_storage_economics.sql`; branch blob `c2f52e3b8f10c485ecb4d1b4e05523b03a52cb51`. | Source timestamp/name differs from the remote version. PR #173 is closed unmerged; PR #208 is Draft/open/unmerged. A Git blob ID is not the SHA-256 of the SQL applied remotely. |
| `20261009210645 bridge_submission_intake_server_only` | [PR #201 patch](https://github.com/picturecrayons-cyber/Media-Factory/pull/201) contains `supabase/migrations/20261010110000_bridge_submission_intake_server_only.sql` (5 lines). | Timestamp differs from the remote version; PR #201 is Draft/open/unmerged. Treat as a later/related candidate only, not the exact original. |
| `20261016161255 bridge_assets_kind_constraint_20261016` | [PR #235 patch](https://github.com/picturecrayons-cyber/Media-Factory/pull/235) contains `supabase/migrations/20261013_bridge_assets_supported_ingest_kinds.sql`; main also contains [`20261004_bridge_assets_add_censor_certificate.sql`](https://github.com/picturecrayons-cyber/Media-Factory/blob/main/supabase/migrations/20261004_bridge_assets_add_censor_certificate.sql). | PR #235 is Draft/open and explicitly says it was not applied. The older main file does not include `technical`; candidate filenames/content do not establish the exact Oct 16 payload. PR #268 is also Draft/open and says no migration was applied by that PR. |
| `20261009210503 bridge_rights_ready_submission` | Previously identified root candidate `migrations/0018_bridge_rights_ready_submission.sql`, provenance commit `90684bc601ad21c57290203b7a0fb78dec286cd0`. | Root `migrations/` belongs to the custom application migrator and is not an exact timestamped Supabase CLI source match. Remote payload checksum is unavailable. |

These findings improve provenance but **do not change any of the above rows from SOURCE NOT RECOVERED to RECOVERED**. Do not rename/copy a candidate into a timestamped Supabase migration or apply it to make the ledger appear aligned.

### Cross-system checks

- **Supabase:** read-only migration inventory still reports Production `mlmgugivsyoxzdgwkbpu` with 52 rows (latest `20261016161255`) and Staging `bbtrosuwisnxacuxvegt` with 33 rows (latest `20261021220723`). Ledgers differ.
- **Vercel:** Preview deployment metadata confirms a READY deployment for PR #317 head `d311f979855b7722fc26875e742bff6e8eaa6dd8`. PR #338's latest listed Preview remains at older commit `32640f0d3b88558fd6b5449e872edba5aac3e39d`, not its current head. Deployment metadata does not contain the original remote SQL payloads.
- **Razorpay:** the related [PR #285](https://github.com/picturecrayons-cyber/Media-Factory/pull/285) explicitly states no live Razorpay sandbox payment was executed. No payment was initiated in this pass; payment/webhook/entitlement E2E remains unverified.
- **Hostinger Mail:** targeted searches for the exact storage-economics and legacy-import migration identifiers in Inbox/Sent returned no matching messages. This is a targeted search, not proof that no relevant mail exists anywhere in the mailbox.
- **Privacy/OAuth:** Supabase organization metadata has `AI_SQL_GENERATOR_OPT_IN`, but does not prove the exact saved `Schema Only` setting. Granted OAuth scopes are not exposed by the inspected connector metadata operations.

### Validation and release gate

Documentation commit `b9f8d987d3384906aaf38ce78f4f79e3edbed0a2` CI run [#1352](https://github.com/picturecrayons-cyber/Media-Factory/actions/runs/39685954191) passed both the `gate` job and `workflow-postgres`. This validates repository checks only; it does not certify source identity, authenticated application E2E, OCI E2E, privacy, OAuth scopes, or Production readiness.

**Decision remains Production NO-GO / NOT CERTIFIED.** Exact source recovery and isolated validation remain incomplete.


## Additional connected-source check — Supabase Branching and Vercel artifact availability (2026-10-22)

- Supabase Production project `mlmgugivsyoxzdgwkbpu` exposes a `main` development branch whose status is **`MIGRATIONS_FAILED`**. This corroborates the Branching failure; no reset, rebase, merge, or migration retry was performed.
- Staging project `bbtrosuwisnxacuxvegt` reports no development branches. It remains a separate project with its own 33-row migration history; it is not a safe proxy for Production migration-source identity.
- Vercel has a READY Preview deployment for the historical storage-economics branch: [deployment `dpl_9oFfn8RhyiS9gfVzoefuopKVMgua`](https://vercel.com/stream-vista-opc-pvt-ltd-s-projects/bridge/9oFfn8RhyiS9gfVzoefuopKVMgua), commit `ba979c5f67f7c63821d349575e77bcee025a6b29`. Attempting to retrieve its deployment file tree returned Vercel `404 File tree not found`; no SQL artifact could be extracted from that deployment.
- Latest CI for the preceding report commit `783f699823f5ddb861bbf07d67bed0f4886782f5` started as run #1353 and was still `in_progress` at the time of this check. Do not call that report commit CI-passed until run #1353 is complete.

This evidence strengthens the incident diagnosis but does not recover original migration payloads or clear the release gate. Production remains **NO-GO / NOT CERTIFIED**.
