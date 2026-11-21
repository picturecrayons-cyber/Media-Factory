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

## Name-based mapping candidates (not equivalence proof)

A mechanical normalized-name comparison against the 73-row source manifest produces five unique name matches and two useful partial-name candidates. These are candidates only: Testing migration SQL bodies are not exposed by the available Supabase migration-ledger API, so none is certified as SQL-equivalent.

| Testing version | Testing name | Candidate source version | Source name | Source SHA-256 | Classification |
|---|---|---|---|---|---|
| 20261114093221 | bridge_site_content_cms_20261114 | 20261114093357 | bridge_site_content_cms_20261114 | b6b366498c674b0c602e7a25b017bc5ea2ff1845f840092027ce92c43e84a5f8 | Name match; SQL NOT VERIFIED |
| 20261116082227 | 20261115220000_bridge_production_documents | 20261115164250 | bridge_production_documents | 857e4fd12235104dae5384f1edf1d9cfeb19d9c46539a7831f87eba3dd5fa0cb | Name match after embedded timestamp normalization; SQL NOT VERIFIED |
| 20261116082234 | 20261115221000_bridge_production_owner_rls_helper | 20261115164711 | bridge_production_owner_rls_helper | c304e0569da1b2909b1373f0b6920bbae1fc8c9a45da54be0d01e008e62ffa0a | Name match after embedded timestamp normalization; SQL NOT VERIFIED |
| 20261118000102 | bridge_dit_storage_objects_20261114 | 20261114135434 | bridge_dit_storage_objects_20261114 | 4a8e8b34f68ed48c3452ae9ec439bb10922da41c58c6992fcdaece0c362da96c | Name match; SQL NOT VERIFIED |
| 20261121042851 | secure_production_asset_owner_helper | 20261121042907 | secure_production_asset_owner_helper | 6fb227b87fd80762f55082fe6a8066835ba6d3ce78f706aafac0615395076523 | Name match; SQL NOT VERIFIED |
| 20261028180900 | test_only_bridge_commercial_engine_20261006230000 | 20261006185556 | bridge_commercial_engine_20261006230000 | 886e50d73abbf7a5c444ee6a873e2bb25aa067ef2ea3690fc3edc8b3ce7464f9 | Partial name; Testing-only wrapper likely; SQL NOT VERIFIED |
| 20261105143656 | 0018_bridge_rights_ready_submission | 20261009210503 | bridge_rights_ready_submission | 351af683aa6e38247caa1318bc29d1ad64bc2dd6c168ae48f927d1f5d52dd573 | Partial name; versioned migration label; SQL NOT VERIFIED |

All remaining Testing rows are unmatched by normalized name and remain unresolved pending source SQL retrieval. Duplicate Testing name `20261106_story_concept_buyer_mandates` appears under two distinct Testing versions and must be reviewed as two separate migrations, not collapsed.

## Updated mapping conclusion

- Exact migration-version matches: 0.
- Unique normalized full-name candidates: 5.
- Partial-name candidates: 2.
- Remaining Testing rows unresolved by name: 63.
- SQL-equivalent mappings certified: 0.
- Do not repair or rewrite the hosted migration ledger based on these candidates.

## READ-ONLY Testing catalog and TVOD candidate audit — 2026-11-21

Testing project `jbymleftneggcgutlcqu` was queried read-only for columns, policies, and the full definitions/security attributes of the TVOD functions. No hosted changes were made.

### Confirmed current Testing schema

- `public.loop_titles.id`: text; publication flags are `is_listed` and `is_published`; price field is `price_paise`. The candidate migration instead references `listed`, `published`, and `tvod_rental_price`.
- `public.loop_user_tvod_entitlements.user_id`: uuid; `title_id`: text. The candidate migration's `CREATE TABLE IF NOT EXISTS` definition proposes both as UUID, which will not alter the already-existing table. Its later `::uuid` cast of the text title identifier is not a safe compatibility assumption.
- `public.loop_payment_events` exists with UUID `user_id`, text event/payment identifiers, and the canonical existing payment event ledger. Candidate also creates a parallel `loop_tvod_payment_events` ledger. This risks splitting deduplication/refund state across two ledgers unless explicitly reconciled.
- Existing `public.loop_fulfill_captured_rental` signature is `(p_payment_id text, p_order_id text, p_user_id uuid, p_title_id text, p_purchased_at timestamptz, p_expires_at timestamptz)`. Candidate replaces a different two-text-argument signature `(p_order_id text,p_payment_id text)`. Call sites and grants must be audited before any replacement.
- Existing `public.loop_refund_captured_rental` signature is `(p_payment_id text,p_refund_id text)`; candidate introduces a three-argument signature and drops a different three-argument overload. This does not safely replace the existing two-argument function.
- Existing `public.has_active_loop_tvod_entitlement(text)` is SECURITY DEFINER, stable, and uses `search_path=public,auth,pg_temp`; it checks authenticated user entitlement state. It must be separately reviewed and preserved, not silently rewritten.
- Current `loop_titles`, `loop_payment_events`, and `loop_user_tvod_entitlements` have a browser-deny policy for anon/authenticated. The candidate's new policies/grants need role-level effective-access tests; policy names alone are insufficient.
- `bridge_creator_documents` already exists with text document IDs, owner user/org fields, storage key, status, verification and revocation timestamps. `bridge_sublicense_authorizations` also exists in Testing with the expected FK to creator documents. Do not recreate or replace either table.
- `bridge_production_assets` already exists with UUID row IDs, text title IDs, owner/upload metadata, tags and file metadata. Four authenticated owner policies are present (SELECT/INSERT/UPDATE/DELETE). Preserve their semantics and test effective privileges, including helper-function execution rights.
- `bridge_dit_storage_objects` exists with UUID session IDs, primary/recovery copy type, object evidence, SHA-256 and verified-state checks. Preserve the DIT evidence constraints.

### TVOD candidate disposition

`supabase/migrations/20261118130000_loop_tvod_payment_fulfillment.sql` is **NOT COMPATIBLE AS WRITTEN** with the current Testing catalog. Confirmed incompatible references include title publication flags/price column, entitlement identifier typing, and fulfillment/refund function signatures. It also proposes a parallel TVOD payment-event ledger despite an existing canonical ledger.

No repair migration has been authored or applied. A safe repair proposal must first preserve the existing public function contracts or explicitly coordinate every call site, retain the canonical payment ledger, bind order capture to trusted verified payment state, use the existing text title ID and UUID auth user ID correctly, and test replay/refund/revocation/expiry and concurrency. Pricing and Bridge publication authorization must be checked against the actual Testing columns and constraints rather than the candidate's assumed names.

### Preservation disposition

- Creator Vault table: present; no schema/data changes.
- Sublicensing table: present; no schema/data changes.
- Production Assets table and four owner policies: present; no schema/data changes.
- DIT storage object evidence table: present; no schema/data changes.
- Effective role/grant and row-level behavioral regression suite: NOT VERIFIED; requires disposable PostgreSQL/Supabase replay.

### Evidence classification

- Testing catalog read: PASS (READ-ONLY snapshot only).
- TVOD candidate compatibility: FAIL (candidate is not directly compatible as written).
- Vault/Sublicensing/Production Assets preservation: PASS for observed table/policy presence; behavioral non-regression NOT VERIFIED.
- Full source-to-Testing SQL semantic mapping: BLOCKED (Testing migration SQL bodies/hash manifest unavailable).
- Disposable replay: BLOCKED / NOT VERIFIED (Docker and Supabase CLI unavailable in execution environment; prior Actions run supplied no jobs/logs).

## TVOD repair design proposal — forward-only, NOT IMPLEMENTED

This section is a design proposal only. It is not a migration file, has not been replayed, and is not approved for hosted application.

### Contract decisions required before implementation

1. **Keep existing public function contracts intact.** Testing currently has:
   - `loop_fulfill_captured_rental(text,text,uuid,text,timestamptz,timestamptz)`
   - `loop_refund_captured_rental(text,text)`
   - `has_active_loop_tvod_entitlement(text)` (SECURITY DEFINER)
   Do not drop, rename, or overload-replace these as a side effect of the repair. Add a separately named, versioned TVOD RPC only if a distinct contract is genuinely required, then update and test all server call sites in the same source change.

2. **Use the existing canonical event ledger.** `public.loop_payment_events` is present and already used by the deployed Testing fulfillment/refund functions. A new parallel `loop_tvod_payment_events` is not proposed. Payment event idempotency, refund-before-capture tombstones and replay handling must all resolve through one ledger.

3. **Use actual Testing identifiers.** The inspected Testing catalog has text `loop_titles.id`, text `loop_user_tvod_entitlements.title_id`, and UUID `user_id`. Proposed order identity therefore uses UUID `user_id` and text `loop_title_id`; no UUID cast of title IDs. Existing application checkout code currently casts both user and title identifiers to UUID, so its server call sites must be made schema-aware before the flow can be considered compatible.

4. **Do not add assumed title columns.** Testing has `loop_titles.is_listed`, `is_published`, `status`, `access_tier`, and `price_paise`. Candidate code's `listed`, `published`, `tvod_rental_price`, `tvod_purchase_price` assumptions are not portable to Testing. Treat the Bridge-approved consumer price row as the authoritative TVOD price only after confirming the full `bridge_loop_consumer_pricing` DDL, FK, status constraints, and admin approval workflow. Compare the persisted order amount (integer paise) against the approved rental price converted deterministically to paise.

5. **Bind payment to persisted order and verified capture.** Server-only checkout persists provider order ID, authenticated user UUID, text Loop title ID, amount paise, INR, and pending state. Fulfillment accepts only the persisted order and provider payment identity after server-side provider signature/capture verification. The RPC must independently validate order ownership, payment identity, amount/currency, captured state, current Bridge publication authorization, territory/language/exploitation rights, and approved price. Client input must never be the source of truth for price, title, owner, capture status or entitlement.

6. **Idempotency and concurrency.** Serialize by provider payment ID and by user/title. Same payment + same order + same user/title/amount returns the original outcome; any identity/amount mismatch fails closed. A replayed refund or a refund-before-capture tombstone must never grant entitlement. A late capture after refund must remain blocked. A delayed older capture must not overwrite a newer entitlement or reactivate a revoked entitlement.

7. **Rental expiry and entitlement.** Use the verified provider capture timestamp as purchase time and a single documented rental duration (currently the application presents 48 hours). Entitlement upsert must preserve the existing unique key and reject conflicting payment identity. Refund marks only the entitlement created by that payment as refunded; it must not revoke a later purchase for the same user/title.

8. **Security.** Keep payment/order/entitlement writes server-only. Revoke function execution from PUBLIC, anon and authenticated; grant only to service_role. Keep an empty/locked search_path and schema-qualify all references. Do not broaden browser table grants. Audit actual effective table privileges, function EXECUTE grants and RLS behavior as part of tests. Review the existing SECURITY DEFINER entitlement-check function separately; do not change its behavior without a dedicated security test and approval.

### Proposed additive migration shape (future implementation only)

- Add an order table if not already present, with UUID user FK to auth.users, text Loop title ID, positive integer paise, INR-only currency, provider order/payment IDs, strict state constraint, capture timestamp, and audit timestamps.
- Add indexes/uniqueness for provider order ID, provider payment ID, and user/title lookup. Add FK only where the actual Testing title/identity constraints support it; do not invent a UUID FK to text title IDs.
- Add restrictive RLS and revoke browser access; service_role-only DML.
- Do not create a second payment-event ledger.
- Add a separately versioned fulfillment/refund RPC only if preserving the current signatures is insufficient; do not drop or replace existing RPCs. Coordinate call-site update in the same source PR.
- Keep Bridge pricing and publication authorization separate from Loop delivery: Bridge authorization is required at checkout and again at fulfillment/playback; Loop never invents or grants licensing rights.

### Required disposable regression suite before a repair can be marked ready

- Fresh replay of the complete intended migration chain and replay against a Testing-catalog fixture.
- Checkout with valid/invalid title, user, amount, currency and Bridge approval.
- Capture with mismatched provider order/payment, wrong user/title/amount, unverified signature and non-captured status.
- Duplicate webhook, concurrent duplicate fulfillment, and duplicate refund.
- Refund-before-capture followed by late capture.
- Refund after entitlement and verify only that payment's entitlement is revoked.
- Newer entitlement followed by delayed older capture.
- Expired rental, revoked Bridge publication, out-of-window rights, wrong territory/language/exploitation model and revoked pricing approval.
- Browser anon/authenticated cannot read protected payment/order rows or execute mutation RPCs; service_role can perform intended operations.
- Assert Creator Vault, Sublicensing, Production Assets and DIT schema/policies/records are unchanged across replay.

### Current disposition

**TVOD repair design: DRAFT / NOT IMPLEMENTED / NOT REPLAYED.** The proposal intentionally does not emit SQL until the complete Testing DDL, source checkout/webhook call graph, provider verification boundary and the disposable replay environment are available. No source migration file was created or modified in this step.

## Application TVOD checkout/webhook call-graph audit — 2026-11-21

Source files inspected:
- `src/lib/loop/subscriptions.ts` — `rentTvodMovie` checkout.
- `src/routes/api/razorpay/webhook.ts` and `src/lib/bridge/payments.ts` — application webhook endpoint and Bridge-only webhook processor.
- `supabase/functions/razorpay-webhook/index.ts` — Supabase Edge webhook processor; this is where the Loop-specific capture/refund branches currently live.
- `src/lib/loop/catalog.ts` — entitlement reads and playback authorization.
- `src/lib/loop/tvod-payment.test.ts` — current source-level assertions.

### Call graph

1. Authenticated Loop client calls `rentTvodMovie({loopTitleId})`.
2. Server checks `loop_rental_fulfillment_ready()`, reads Loop title + Bridge publication + Bridge consumer pricing, creates Razorpay order, then inserts `loop_tvod_orders`.
3. Razorpay posts `payment.captured` to the Supabase Edge Function. The Edge Function verifies webhook HMAC, records/claims `bridge_webhook_events`, detects Loop via payment/order notes or an order lookup, checks provider payment ID, amount and INR, updates order to captured, then calls `loop_fulfill_captured_rental`.
4. `refund.processed` resolves the Loop order (including a Razorpay payment lookup fallback) and calls `loop_refund_captured_rental`.
5. `checkPlaybackEntitlement` / `getAuthorizedLoopPlayback` read `loop_user_tvod_entitlements`; Bridge publication authorization is checked again before signed playback.

The application route `/api/razorpay/webhook` calls `ingestRazorpayWebhook` in `src/lib/bridge/payments.ts`, which handles Bridge payment capture only. It does not implement the Loop fulfillment branch. The Edge Function is therefore the current Loop webhook implementation path.

### Blocking call-graph incompatibilities

1. **Checkout validator blocks text title IDs.** `rentTvodMovie` requires `z.string().uuid()`, while Testing `loop_titles.id` is text. Existing Loop catalog APIs accept text IDs. This prevents a valid Testing text title ID from reaching checkout.
2. **Checkout query uses non-existent Testing fields.** It reads `l.listed`, `l.published`, and `l.tvod_rental_price`; Testing has `is_listed`, `is_published`, and `price_paise`. It also compares Bridge pricing to `l.tvod_rental_price`. Checkout will fail against the inspected Testing schema.
3. **Checkout casts the text title ID to UUID.** The insert into `loop_tvod_orders` casts `${title.id}::uuid`, inconsistent with Testing's text title ID. It also depends on the candidate order table definition being applied.
4. **Order persistence is not atomic with provider order creation.** Razorpay order is created before the local row is inserted. If DB persistence fails, the provider order exists without a local order record; capture webhook correctly fails closed, but the payable orphan requires expiry/reconciliation. Add idempotency/recovery or create a local pending intent first and bind the provider ID transactionally.
5. **Fulfillment RPC signature mismatch.** Edge Function calls `loop_fulfill_captured_rental(text,text)`; Testing exposes `loop_fulfill_captured_rental(text,text,uuid,text,timestamptz,timestamptz)`. Without a new, explicitly versioned compatible RPC, the current Loop capture path cannot execute on Testing.
6. **Refund RPC signature mismatch.** Edge Function calls three arguments `(text,text,text)`; Testing exposes `loop_refund_captured_rental(text,text)`. Current refund path cannot execute on Testing as written.
7. **Webhook timestamp is receipt time, not verified provider capture time.** Edge Function sets `captured_at` to `new Date()` when it first processes the webhook. Delayed/retried delivery therefore shifts the 48-hour rental window. The provider payment entity's authoritative timestamp must be validated and persisted (or a documented trusted provider lookup used).
8. **Refund-before-capture handling is incomplete at the webhook boundary.** The refund handler tries to find an order by payment ID or provider lookup; if no order can be resolved and surface detection is not explicitly Loop, the event can be marked processed without a Loop tombstone. A later capture could then be treated as new. The repair must durably record unresolved refund identities or keep the webhook event retryable/blocked until reconciliation.
9. **Loop event handling is separate from the app webhook path.** Verify the configured Razorpay webhook target is the Supabase Edge Function and not the app route; only the Edge Function contains Loop processing. This configuration was not inspected and remains NOT VERIFIED.
10. **Source tests are largely text assertions.** Current TVOD tests assert source substrings and do not execute PostgreSQL, prove RPC signatures, check schema compatibility, simulate concurrent webhook claims, or exercise actual refund/capture state transitions.

### Current disposition

**Application call graph: FAIL against inspected Testing schema.** The end-to-end TVOD flow is not ready for implementation or release until checkout identifiers/columns, order persistence, fulfillment/refund RPC contracts, provider capture time, and refund tombstone behavior are reconciled. No application source code or migration SQL was modified in this audit step.

## Follow-up READ-ONLY Testing catalog/function verification — 2026-11-21

Target: Supabase project `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB).
Action: catalog, constraints, policies, function definitions and EXECUTE grants only.
Access: READ-ONLY.
Risk: no hosted data or schema changes.

### Confirmed schema facts

- `public.loop_tvod_orders` is absent.
- `public.bridge_loop_consumer_pricing` is absent.
- `public.loop_payment_events` exists and is the canonical payment-event ledger. Its `event_id` is UNIQUE; allowed statuses are `received`, `processed`, `refunded`, `failed`, `reconciliation_required`. `user_id` references `auth.users(id)`.
- `public.loop_titles.id` is TEXT; status constraint values are uppercase `DRAFT`, `APPROVED`, `PUBLISHED`, `ARCHIVED`, `REVOKED`. Listing fields are `is_listed`, `is_published`; price field is `price_paise` (BIGINT).
- `public.bridge_loop_publications` has TEXT `loop_title_id` and TEXT `bridge_title_id`, destination constrained to `CRAYONS_LOOP`, authorization values constrained to uppercase `HOLD`, `AUTHORIZED`, `REVOKED`, `EXPIRED`. It has `approved_at`, `window_start`, `window_end`, `territories`, `languages`, and `exploitation_models`.
- `public.loop_user_tvod_entitlements` uses UUID `user_id`, TEXT `title_id`, access types `RENTAL`/`PURCHASE`, statuses `ACTIVE`/`REFUNDED`/`REVOKED`/`EXPIRED`, and UNIQUE `payment_transaction_id` plus UNIQUE `(user_id,title_id,access_type)`.
- The four inspected tables `loop_titles`, `loop_payment_events`, `loop_user_tvod_entitlements`, and `bridge_loop_publications` each have a `deny_browser_access` policy for anon/authenticated with false USING and WITH CHECK.

### Exact existing RPC contracts and behavior

- `loop_fulfill_captured_rental(text,text,uuid,text,timestamptz,timestamptz)` exists. It validates non-null identity/timestamps, enforces a 48-hour window, advisory-locks payment and user/title, uses `loop_payment_events` event key `tvod:<payment>`, refuses a refunded payment, checks uppercase publication/title states and approved publication window/territory/language/model, and upserts the existing entitlement.
- `loop_refund_captured_rental(text,text)` exists. It inserts a `refunded` payment event when no capture record exists (refund-before-capture tombstone), or marks the payment event and matching entitlement refunded.
- `loop_rental_fulfillment_ready()` checks for the canonical payment event and the six-argument fulfillment function.
- EXECUTE grants are present for `service_role` and `postgres`; no anon/authenticated EXECUTE grants appeared in `information_schema.routine_privileges` for these functions. This is catalog evidence, not an effective-role runtime test.
- `has_active_loop_tvod_entitlement(text)` is SECURITY DEFINER and checks active, unexpired `RENTAL` entitlement for `auth.uid()`; keep it out of this repair unless a separate explicit security review demonstrates a necessary change.

### Revised implementation contract

1. Do not create another payment-event ledger. Use `loop_payment_events` and preserve its unique event identity/status vocabulary.
2. Do not add a parallel `loop_tvod_orders` dependency without a separate schema proposal. A durable order-intent representation must first be designed against actual available schema and current application behavior.
3. Do not create/use `bridge_loop_consumer_pricing` as though it already exists. Current Testing price source is `loop_titles.price_paise`; any Bridge-side pricing authority requires a separately justified schema design and reconciliation with source policy.
4. Update checkout validation to accept the actual text title ID and avoid UUID casts of title IDs. User IDs remain UUID.
5. Align title/publication status casing and publication gate with the actual uppercase constraints and the existing fulfillment RPC.
6. Call the existing six-argument fulfillment function with persisted/verified payment ID, order ID, UUID user ID, TEXT title ID, authoritative capture timestamp and exactly 48-hour expiry. Never call a two-argument overload that is not present.
7. Call the existing two-argument refund function; its current implementation already creates a refund-before-capture tombstone. Verify that webhook routing and payment ID resolution always reach it for Loop events.
8. Persist/verify provider order and capture identity, amount and currency before fulfillment. The present Edge Function's `loop_tvod_orders` lookup/update must be replaced by a contract that can be durably reconciled without a nonexistent table.
9. Treat the current Edge Function as the only inspected implementation containing Loop TVOD fulfillment; production webhook target/configuration remains NOT VERIFIED. The app route delegates to Bridge-only `ingestRazorpayWebhook`.

### Revised status

- Testing catalog/function inspection: PASS (READ-ONLY evidence gathered).
- Existing order table / Bridge consumer pricing table: FAIL (both absent).
- Existing fulfillment/refund RPC compatibility with current Edge Function: FAIL.
- Browser-deny policies and service_role EXECUTE grants: PASS as catalog observations; effective runtime authorization: NOT VERIFIED.
- Application checkout/webhook compatibility: FAIL.
- No hosted writes, no SQL migrations, no source application changes, no Production operations.

### CI and replay evidence update

- Audit branch CI push run for commit `d1a45ebb23cc5ffa28a65b939afe1872b9fa77aa`: run `44888334395`, conclusion `failure`.
- GitHub returned zero jobs for that run; there are no job steps or logs available to establish a code/test failure or a migration replay result.
- Earlier isolated replay run `44887864847` also concluded `failure` with zero reported jobs.
- Local environment previously inspected has neither Docker nor Supabase CLI. A disposable PostgreSQL/Supabase replay therefore remains BLOCKED / NOT VERIFIED.
- A red/failed workflow with no jobs is not evidence that the SQL chain passed or failed; do not label replay PASS.
