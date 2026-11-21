# Testing vs source migration inventory — 2026-11-21

## Scope and safety

- Repository: `picturecrayons-cyber/Media-Factory`
- Audit branch: `audit/testing-migration-reconciliation-20261121`
- Testing project: `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB)
- This report uses the Supabase migration ledger and repository source inventory only.
- Testing access: READ-ONLY. No hosted migration, schema, data, ledger, reset or rebase operation was performed.
- Production project `mlmgugivsyoxzdgwkbpu`: HOLD; no operation performed.
- Source inventory: 75 SQL files (73 historical Production-ledger files plus two feature candidates).
- Testing ledger: 70 records.
- Exact version overlap: 0.
- Exact SQL hash comparison against Testing: NOT POSSIBLE from the exposed migration ledger, which returns only version and name, not stored SQL or a source hash.

## Interpretation

Zero exact version matches means the version identifiers differ; it does not prove that all 75 source migrations are absent semantically. The Testing ledger contains independently versioned, environment-specific migrations, including TVOD and Vault-related records. A semantic mapping requires each Testing migration's SQL source (or a trustworthy exported statement/hash manifest) and catalog evidence for its effects. Do not use migration names alone to repair the ledger.

## Testing ledger inventory

| Testing version | Testing name | Exact source version match |
|---|---|---|
| 20261028180816 | `test_only_bridge_core_baseline_20261028` | No exact source-version match |
| 20261028180834 | `test_only_bridge_rls_20260921` | No exact source-version match |
| 20261028180856 | `test_only_bridge_assets_censor_certificate_20261004` | No exact source-version match |
| 20261028180900 | `test_only_bridge_commercial_engine_20261006230000` | No exact source-version match |
| 20261028180907 | `test_only_duplicate_title_reconciliation_20261028` | No exact source-version match |
| 20261028180912 | `test_only_harden_commercial_server_only_20261028` | No exact source-version match |
| 20261028180915 | `test_only_commercial_control_plane_20261028` | No exact source-version match |
| 20261028180918 | `test_only_financial_reversal_hardening_20261028` | No exact source-version match |
| 20261028180922 | `test_only_commercial_performance_indexes_20261028` | No exact source-version match |
| 20261028180926 | `test_only_story_concept_submission_20261028` | No exact source-version match |
| 20261029014139 | `test_bridge_workflow_schema_parity_20261029` | No exact source-version match |
| 20261029014203 | `test_censor_certificate_metadata_versions_20261029` | No exact source-version match |
| 20261030133503 | `testing_security_hardening_20261030` | No exact source-version match |
| 20261104203045 | `bridge_staging_data_api_lockdown_20261105` | No exact source-version match |
| 20261104203415 | `bridge_staging_function_execute_defaults_20261105` | No exact source-version match |
| 20261105084111 | `bridge_staging_identity_links_reconciliation_20261105` | No exact source-version match |
| 20261105143656 | `0018_bridge_rights_ready_submission` | No exact source-version match |
| 20261106025823 | `bridge_testing_workspace_rls_20261106` | No exact source-version match |
| 20261106025842 | `bridge_asset_storage_provenance_0022_20261106` | No exact source-version match |
| 20261106031604 | `bridge_titles_no_browser_update_policy_20261106` | No exact source-version match |
| 20261106031723 | `bridge_server_authoritative_uploads_0023_20261106` | No exact source-version match |
| 20261106032656 | `bridge_workspace_verified_identity_guard_20261106` | No exact source-version match |
| 20261106051631 | `story_concept_atomic_idempotency_testing_20261106` | No exact source-version match |
| 20261106063206 | `razorpay_webhook_processing_lease_schema` | No exact source-version match |
| 20261106083338 | `revenue_distribution_intelligence_20261106` | No exact source-version match |
| 20261106083617 | `20261106_story_concept_buyer_mandates` | No exact source-version match |
| 20261106084908 | `20261106_story_concept_buyer_mandates` | No exact source-version match |
| 20261108222208 | `grant_authenticated_usage_bridge_private_schema` | No exact source-version match |
| 20261109124007 | `staging_film_content_owner_leads_20261109` | No exact source-version match |
| 20261109134919 | `buyer_requirement_intelligence_private_20261109` | No exact source-version match |
| 20261109135114 | `buyer_requirement_foreign_key_indexes_20261109` | No exact source-version match |
| 20261110183356 | `staging_bridge_role_rpc_and_multi_studio_membership` | No exact source-version match |
| 20261110183454 | `loop_runtime_tables_and_atomic_tvod_fulfillment_staging` | No exact source-version match |
| 20261110183528 | `staging_server_only_deny_policies_and_loop_minimum_grants` | No exact source-version match |
| 20261110183943 | `loop_watch_progress_authenticated_own_rows_only` | No exact source-version match |
| 20261110184842 | `bridge_multi_studio_membership_lookup_index` | No exact source-version match |
| 20261110193739 | `bridge_rights_evidence_verification_0021_staging` | No exact source-version match |
| 20261111100344 | `loop_public_catalog_rpc` | No exact source-version match |
| 20261111100648 | `loop_tvod_entitlement_rpc` | No exact source-version match |
| 20261111101656 | `20261111101500_loop_public_catalog_and_tvod_entitlement_rpc` | No exact source-version match |
| 20261111101742 | `loop_rental_fulfillment_readiness` | No exact source-version match |
| 20261111102654 | `20261111102000_loop_rental_fulfillment_readiness` | No exact source-version match |
| 20261111110755 | `streamvista_customer_intake` | No exact source-version match |
| 20261111111042 | `streamvista_private_project_storage` | No exact source-version match |
| 20261111163440 | `buyer_acquisition_mandate_legal_scope_20261111` | No exact source-version match |
| 20261111163555 | `buyer_organization_legal_verification_20261111` | No exact source-version match |
| 20261114075718 | `bridge_dit_ingest_testing_20261114` | No exact source-version match |
| 20261114093221 | `bridge_site_content_cms_20261114` | No exact source-version match |
| 20261116082227 | `20261115220000_bridge_production_documents` | No exact source-version match |
| 20261116082234 | `20261115221000_bridge_production_owner_rls_helper` | No exact source-version match |
| 20261116082236 | `20261116083000_harden_bridge_title_owner_helper` | No exact source-version match |
| 20261116111314 | `secure_public_loop_catalog_testing` | No exact source-version match |
| 20261116111344 | `grant_public_loop_catalog_invoker_reads_testing` | No exact source-version match |
| 20261116111454 | `normalize_public_loop_catalog_schema_testing` | No exact source-version match |
| 20261116111631 | `restrict_public_loop_catalog_rpc_to_edge_service_testing` | No exact source-version match |
| 20261116210822 | `bridge_title_hold_block_controls` | No exact source-version match |
| 20261116224138 | `loop_viewer_profiles_20261117` | No exact source-version match |
| 20261116224140 | `loop_watchlists_20261117` | No exact source-version match |
| 20261116233444 | `streamvista_legacy_links_unresolved_resolution_state` | No exact source-version match |
| 20261116234234 | `harden_legacy_links_service_role_privileges_20261117` | No exact source-version match |
| 20261116234306 | `bridge_legal_consent_evidence_20261117` | No exact source-version match |
| 20261118000102 | `bridge_dit_storage_objects_20261114` | No exact source-version match |
| 20261118000214 | `bridge_production_schedule_20261118` | No exact source-version match |
| 20261118001111 | `bridge_studio_invites_and_owner_transfer_20261118` | No exact source-version match |
| 20261119093620 | `bridge_creator_document_vault_20261118` | No exact source-version match |
| 20261119093624 | `bridge_exclusive_sublicensing_authority_20261119` | No exact source-version match |
| 20261119203532 | `20261120110000_bridge_story_concept_rights_review_workflow` | No exact source-version match |
| 20261119211802 | `malayalakkara_conditional_submission_test_only` | No exact source-version match |
| 20261121041513 | `20261121_private_title_owner_rls_helper` | No exact source-version match |
| 20261121042851 | `secure_production_asset_owner_helper` | No exact source-version match |

## Source SQL inventory

The SHA column below is the Git blob SHA for file identity, not a SQL-content SHA-256. The authoritative source SQL SHA-256 values for the 73 historical migrations remain in `docs/release/bridge-supabase-migration-reconciliation-2026-11-16.md`.

| Source version | Source file | Git blob SHA |
|---|---|---|
| 20260925141006 | `20260925141006_create_legacy_import_schema.sql` | 43c132be9fcc479da662064bbc292dc4346aa189 |
| 20260925170237 | `20260925170237_bridge_auth_schema.sql` | 18f3e8662bc3de258111a642254907797c081766 |
| 20260925170239 | `20260925170239_bridge_operational_schema.sql` | c02c69325548359aa1d26bdf46d3fdeb592e2ffa |
| 20260925170241 | `20260925170241_bridge_webhook_retry.sql` | 69776880d1cc2bb4a54cfd26d2c4b128c61dd64d |
| 20260925170308 | `20260925170308_bridge_fk_indexes.sql` | 9622de6c26cf4191691200a449d39c6390f14b40 |
| 20260925193451 | `20260925193451_bridge_webhook_processing_token.sql` | 02f8f8d01bdc7cf96156a9a0a2c3d13839f6551e |
| 20260925214917 | `20260925214917_loop_canonical_runtime_baseline.sql` | 03cb7c32ab3d73809438548e29807fd2940c878e |
| 20260925214936 | `20260925214936_loop_runtime_rls_and_plans.sql` | 1e692637f9a07d415a9acfd26ffa8523e9d01b3a |
| 20260925220714 | `20260925220714_bridge_loop_verified_identity_links.sql` | 4f9e95be73e304020d095475211b596a37c392b5 |
| 20260926045625 | `20260926045625_loop_payment_events_own_read_policy.sql` | 577d89d17e7aca46eac3b5f3c92f5cdd8982eab0 |
| 20260926054626 | `20260926054626_add_poster_studio_schema.sql` | d1aa4396bbf5b44294a8351cd23aadff50bc5c02 |
| 20260927094608 | `20260927094608_harden_server_only_grants_and_fk_indexes.sql` | c48dea8965396597d541d9e4321f386f05656f92 |
| 20260927114947 | `20260927114947_streamvista_media_os_service_pipeline.sql` | d932a7b2917016fde076802de4af6a1b95d29dab |
| 20260927215559 | `20260927215559_bridge_data_api_lockdown.sql` | c8365b5040ab51387e65d8d254df035446c295af |
| 20260927215742 | `20260927215742_bridge_buyer_title_access.sql` | 8d28b54a43a015e1bda3490eaa77112bcd300364 |
| 20260927215758 | `20260927215758_bridge_buyer_title_access_20260928.sql` | 8d28b54a43a015e1bda3490eaa77112bcd300364 |
| 20260928102539 | `20260928102539_bridge_profile_welcome_email_marker.sql` | ce0f508d52e132dd36ca9cf3efc69f219396c942 |
| 20260928120120 | `20260928120120_bridge_prd_phase1.sql` | dae60638eee12993c7051cefe87d1c41acd1f0d3 |
| 20260928154653 | `20260928154653_bridge_auth_protected_read_policies.sql` | 6d56e42d4e7001694b7644a8d3bc209f536f0242 |
| 20260929154225 | `20260929154225_bind_bridge_rls_identity_and_read_scope.sql` | e4912ccf7de89954fb711d023407079f0f77ac35 |
| 20260929162737 | `20260929162737_harden_bridge_rls_helpers_rpc_surface.sql` | 0cd218af482209d9696204758e0cb64e329d7b43 |
| 20260930092721 | `20260930092721_grant_authenticated_bridge_current_internal_role.sql` | 3a129ddc30287fbc178fa914e1c0bad46cf578b0 |
| 20261002171708 | `20261002171708_loop_release_safety.sql` | 60e2f3d8e279931612d1af0abb02f9338858cbe3 |
| 20261004051643 | `20261004051643_loop_semantic_search.sql` | 8bd03778b0a9124151cd77d3e527ac090305cbbb |
| 20261004052641 | `20261004052641_move_vector_to_extensions_schema.sql` | 9ba37308248eaefe3a11cc1781b5540eda2f8686 |
| 20261004052646 | `20261004052646_rebind_loop_semantic_rpc_vector_schema.sql` | db6a264fa557a175d11793cb9dc6ab59e7721fc4 |
| 20261004102348 | `20261004102348_delivery_trace_finance.sql` | 553e3877b84fca619d6b560a0f992cd06c8c9888 |
| 20261005112318 | `20261005112318_investor_account_type_20261005.sql` | 0b0b5714c931abf081a82057760ea9db0c5c7d1e |
| 20261005124904 | `20261005124904_bridge_dmca.sql` | b07da79fa7889efad954c25787704a871c594ba0 |
| 20261005125643 | `20261005125643_lock_down_bridge_client_grants.sql` | 1990fde3f2741b5150b67e77acfffa8e30ec486a |
| 20261005125847 | `20261005125847_explicit_deny_policies_for_internal_tables.sql` | d53f51ad9f0333b3c7d4b9a5514189b2d38b4001 |
| 20261006100425 | `20261006100425_allow_bridge_supabase_auth_onboarding_verification.sql` | a0a3b7fefc5b96631da1710ff104036554aef78c |
| 20261006152111 | `20261006152111_bridge_buyer_publication_gates.sql` | 29a8f46b43f910dfc74ca6fae283cea21eb94a57 |
| 20261006154551 | `20261006154551_harden_authz_server_only_surfaces_20261006.sql` | 2334a1bdf408cecdbb171123fe324713e1b89158 |
| 20261006154553 | `20261006154553_legacy_creator_intake_20261006.sql` | 2ba8a3b99982399974b540655814f3e7d7786696 |
| 20261006185556 | `20261006185556_bridge_commercial_engine_20261006230000.sql` | cd303761295770ec63ec9421b403a65e804db66a |
| 20261006185640 | `20261006185640_harden_bridge_commercial_server_only_20261007000000.sql` | 2bef15bb0a185afebca31fdeba8b816d6b575ae1 |
| 20261006195531 | `20261006195531_bridge_commercial_control_plane_20261007013000.sql` | e5710413945137ac471319ada82d1a129e0545e0 |
| 20261006195536 | `20261006195536_bridge_financial_reversal_hardening_20261007020000.sql` | f05972a592ca4569d161ddd8f6c43cc0517f69d5 |
| 20261006195607 | `20261006195607_bridge_commercial_performance_indexes_20261007023000.sql` | 2e477857ca197557b08c7dd09a818402a83a3bf9 |
| 20261006231321 | `20261006231321_deep_clean_server_only_rls_20261007.sql` | 1e03b0552eba569742a9fe04a6b883e7cfb04233 |
| 20261008031103 | `20261008031103_loop_watchlists_20261008.sql` | f8f8612faa396809abb4a62cc8b665a2c107e170 |
| 20261008050017 | `20261008050017_p0_bridge_catalog_deal_room_reconciliation_20261008.sql` | 0483ce054a9b0edd6e33bc0f8eca60d2ebc36950 |
| 20261008053655 | `20261008053655_p0_bridge_catalog_deal_room_reconciliation_v2.sql` | 62f1bb2638deb6d197555e4618001d37d866a9c2 |
| 20261008053658 | `20261008053658_p0_bridge_title_catalog_columns_v2.sql` | 0912136aee1d20911a79b9c911afbbe118ae8969 |
| 20261008053700 | `20261008053700_p0_loop_catalog_pranayam_visibility_v2.sql` | b47b705baf38146b88d40c7cc7f66edc87dc9f79 |
| 20261008113911 | `20261008113911_reconcile_duplicate_title_merge_gate_20261008.sql` | 08ebc253f0ded0153f14fe9928e8cfd68466e97d |
| 20261008122836 | `20261008122836_enable_merge_table_rls.sql` | 80b1eaad9f1475ca6f8095b1070d157b392d87c5 |
| 20261009210503 | `20261009210503_bridge_rights_ready_submission.sql` | 4afb295dd5a1fb54fab423ef5b6014861cc9a5e1 |
| 20261009210645 | `20261009210645_bridge_submission_intake_server_only.sql` | 5d8d896bab2e3869d141ec5a5e64009c179a75fa |
| 20261011041046 | `20261011041046_bridge_storage_economics_20261011.sql` | 9cf4d501d5e324c983e9795657b02145b0e8d725 |
| 20261016161255 | `20261016161255_bridge_assets_kind_constraint_20261016.sql` | 67264499bdcecd976be916530fe5daa5498da775 |
| 20261113090250 | `20261113090250_bridge_studio_organizations_20261113.sql` | 21a3d601c7fc646f6feaa264368f0ab53bbe6aca |
| 20261113090257 | `20261113090257_bridge_story_concept_nonrow_privileges_20261113.sql` | 38850913dad8e342d5dfb4c60e1dda0262bb19d3 |
| 20261113090449 | `20261113090449_bridge_studio_member_role_vocabulary_20261113.sql` | e47dfd35d6a5d27b0ffb57382785c193844ed795 |
| 20261113090535 | `20261113090535_map_verified_streamvista_studio_owner_20261113.sql` | 7aecd748c0b3b7781a99ff04bdd849f353f04cf6 |
| 20261113090954 | `20261113090954_bridge_title_organization_fk_20261113.sql` | 56502c5fa26630f5a14bf6ecba9122508aeac1e0 |
| 20261114074642 | `20261114074642_bridge_dit_ingest_20261114.sql` | 9ada3a53f7fe531d946afd2c9c5f6faa2462fbd3 |
| 20261114091812 | `20261114091812_harden_bridge_private_storage_and_rls_helpers_20261114.sql` | 99e1eb5ef2053c3ae6c88f1c9b58813c990ccb50 |
| 20261114093249 | `20261114093249_hostinger_inbound_mail_events_20261114.sql` | 5001d3cfe113091833060ff65e1248b7556bd5b4 |
| 20261114093357 | `20261114093357_bridge_site_content_cms_20261114.sql` | df0bc2559ba2fa0086e80ac22760854dd6079e4e |
| 20261114135434 | `20261114135434_bridge_dit_storage_objects_20261114.sql` | 6b83bf8f01c4099a9f8fe1df20d09a0061e798f7 |
| 20261114135437 | `20261114135437_bridge_delivery_job_ownership_20261114.sql` | 8eb922c451072141a83bbdffee6e36a038987b64 |
| 20261114135439 | `20261114135439_bridge_multilingual_rights_packages_20261114.sql` | ae13f1c7ab8acf713b48ad76b02e0e54e45b70f0 |
| 20261114135443 | `20261114135443_bridge_notification_outbox_20261114.sql` | 272596f9a6ba5dd04fb93ca6df62fc87a8456490 |
| 20261115164250 | `20261115164250_bridge_production_documents.sql` | a1c37974bbdbe49d00c7a9637256d68f01a4ae61 |
| 20261115164711 | `20261115164711_bridge_production_owner_rls_helper.sql` | ec9860e733506f88d8b01b37ad67ac3ff4490857 |
| 20261115165233 | `20261115165233_bridge_production_owner_helper_revoke_anon.sql` | 4a55260bb103c0d086de30cb434e1ed2210645fb |
| 20261116090923 | `20261116090923_bridge_title_owner_helper_search_path_hardening_20261116.sql` | c6b0354d2ed4adecbfe00944aef91a0cde1eee44 |
| 20261116114408 | `20261116114408_secure_public_loop_catalog_production.sql` | d6489deea48753359e58050cb2a42686e183f496 |
| 20261118123335 | `20261118123335_bridge_master_language.sql` | ebaea2e148e6ed0d41918cc561d8042b9a2ee716 |
| 20261118130000 | `20261118130000_loop_tvod_payment_fulfillment.sql` | edf3ce3d91d248d5871f7065ab654eb89835e9ba |
| 20261118150000 | `20261118150000_bridge_exclusive_sublicensing_authority.sql` | a1f517a45ebb33aa25e9de45f8d2fbfb00abe95c |
| 20261119203855 | `20261119203855_bridge_story_concept_author_rights_declaration_20261120.sql` | 997a875efb32b967c2b776ff3a08acb59d482f54 |
| 20261121042907 | `20261121042907_secure_production_asset_owner_helper.sql` | aa72859c18d2599f8862975e9901c68e62709f9b |

## TVOD repair gate

The currently inspected Testing schema diverges from the source TVOD candidate in publication flags, rental price representation, title ID typing, payment-event model and fulfillment function signature. No repair migration is included in this inventory commit. A safe repair must be additive and forward-only, bind to the existing Testing schema contract, preserve idempotent payment fulfillment, and prove server-only mutation and fail-closed entitlement behavior.

## Preservation gates

- Creator Document Vault: preserve its existing application migration and document/storage/owner semantics.
- Sublicensing: do not fabricate `bridge_creator_documents` or substitute a guessed FK.
- Production Assets: no schema rewrite, ownership-policy rewrite or data movement.
- No Testing hosted writes; no Production writes; no PR merge or deployment.

## Replay status

- CI was enabled for this audit branch by commit `4a96ca2dee5151b7c2b7d39d6cb5b50622397c33`.
- GitHub Actions run: https://github.com/picturecrayons-cyber/Media-Factory/actions/runs/44887864847
- Run conclusion: FAILURE. The workflow-run API returned no job records, so no migration replay logs or successful replay result are available. Do not mark replay PASS.
- The agent's local execution environment has neither Docker nor the Supabase CLI installed; direct local replay was therefore not available there.

## Required next evidence

1. Export the exact SQL (or SHA-256 manifest) corresponding to each of the 70 Testing ledger entries from an approved source.
2. Compare each Testing statement against the 75 source files and classify as exact, equivalent, divergent, Testing-only, or unresolved.
3. Complete DDL, RLS/policy, GRANT, function signature/body, SECURITY DEFINER, search_path and EXECUTE privilege review for every mapped pair.
4. Build a source-compatible TVOD forward-only repair only after the existing order/payment/entitlement contract is established.
5. Run the full replay in a disposable local Supabase stack and retain complete job logs and catalog assertions.
