# Testing DB migration SQL hash inventory and exact-source comparison — 2026-11-21

## Scope and safety

- Target: **STAGING / Testing DB** — Supabase project `jbymleftneggcgutlcqu` (Crayons Projects - Testing DB).
- Action: READ-ONLY inspection of `supabase_migrations.schema_migrations`; SHA-256 computed over each stored `statements[1]` value; compare against the canonical 73-row Production source manifest and the two active feature-candidate SQL files.
- Access: STAGING / Testing DB READ-ONLY; repository audit branch WRITE (documentation only).
- Risk: no hosted schema, data, migration ledger, or application code changed.
- PRODUCTION DB `mlmgugivsyoxzdgwkbpu`: HOLD / NOT CERTIFIED / NO-GO; no access or operation in this step.

## Corrected finding

The earlier repository-only archive search was incomplete as a statement about the Testing database. No Testing SQL archive or hash manifest was found in the repository, **but the Testing database itself stores the exact SQL statement text** in `supabase_migrations.schema_migrations.statements`.

Read-only verification:

- Testing migration rows: **70**.
- Rows with a stored SQL statement: **70 / 70**.
- Rows without stored SQL: **0**.
- Each row has exactly one stored statement.
- Total stored SQL bytes: **200,815**.
- Exact migration version overlap with the 75-file source inventory: **0**.
- Exact SQL byte/hash matches against the 73-row canonical Production source manifest: **7**.
- Exact SQL hash matches against the two active feature-candidate files (`20261118130000_loop_tvod_payment_fulfillment.sql`, `20261118150000_bridge_exclusive_sublicensing_authority.sql`): **0**.
- Therefore **63 / 70 Testing statements do not exactly match any of the 75 current source SQL files**. They remain semantically UNRESOLVED; a hash mismatch is not proof that their schema effects are absent or incompatible.

SHA-256 was calculated directly in PostgreSQL over stored statement text, without whitespace normalization. SQL byte counts are `octet_length(statements[1])`.

## Exact SQL matches to canonical Production source

These are exact byte-for-byte SQL statement hash matches, despite different Testing and Production migration versions/names:

| Testing version | Testing name | Production source version | Production source name | SHA-256 |
|---|---|---|---|---|
| 20261028180900 | `test_only_bridge_commercial_engine_20261006230000` | 20261006185556 | `bridge_commercial_engine_20261006230000` | `886e50d73abbf7a5c444ee6a873e2bb25aa067ef2ea3690fc3edc8b3ce7464f9` |
| 20261028180912 | `test_only_harden_commercial_server_only_20261028` | 20261006185640 | `harden_bridge_commercial_server_only_20261007000000` | `667b6df954fbf6762e9c32d001d198d0e334249230e2d2b1d0a22310a056cf1e` |
| 20261028180915 | `test_only_commercial_control_plane_20261028` | 20261006195531 | `bridge_commercial_control_plane_20261007013000` | `f845a5da877435fe954579ce6d6d4bdd33e6f291e5b3a3074878829dea36a464` |
| 20261028180918 | `test_only_financial_reversal_hardening_20261028` | 20261006195536 | `bridge_financial_reversal_hardening_20261007020000` | `85fe3a2ccdd239a4cd8aee06e16f96a3c65cec0be1a8ff6047f3b2ca586903f8` |
| 20261114075718 | `bridge_dit_ingest_testing_20261114` | 20261114074642 | `bridge_dit_ingest_20261114` | `eb287c589ce7f7ff344fa82c3b1600cc72bb00d086a54ee1655959d38b577294` |
| 20261114093221 | `bridge_site_content_cms_20261114` | 20261114093357 | `bridge_site_content_cms_20261114` | `b6b366498c674b0c602e7a25b017bc5ea2ff1845f840092027ce92c43e84a5f8` |
| 20261121042851 | `secure_production_asset_owner_helper` | 20261121042907 | `secure_production_asset_owner_helper` | `6fb227b87fd80762f55082fe6a8066835ba6d3ce78f706aafac0615395076523` |

These exact matches establish source identity for those SQL statements only. They do not prove that the entire Testing schema equals Production, nor do they certify migration ordering, effective grants, runtime behavior, or semantic equivalence of unmatched rows.

## Full Testing SQL hash inventory

| Testing version | Testing name | SQL bytes | Stored SQL SHA-256 | Exact Production source hash result |
|---|---|---:|---|---|
| 20261028180816 | `test_only_bridge_core_baseline_20261028` | 4599 | `65c4c4ea3197948ec1272647903694ce3a224884e513fb34d74a6bf92c39bf5e` | No exact Production SQL hash match |
| 20261028180834 | `test_only_bridge_rls_20260921` | 1453 | `12bc7b6959c230e4508e59280da4ba5c943cd89c00975fd4d993217ae7ea25d7` | No exact Production SQL hash match |
| 20261028180856 | `test_only_bridge_assets_censor_certificate_20261004` | 448 | `e0cac9ac116a2f7a7c331821d02c5c3f85d0e440dbf1605e98a5659ce09cb43f` | No exact Production SQL hash match |
| 20261028180900 | `test_only_bridge_commercial_engine_20261006230000` | 28612 | `886e50d73abbf7a5c444ee6a873e2bb25aa067ef2ea3690fc3edc8b3ce7464f9` | EXACT Production SQL match |
| 20261028180907 | `test_only_duplicate_title_reconciliation_20261028` | 4829 | `f598f9c01f29a231aaa73882e5621ce4c94d4e051458712a79dbaa3f69f4d651` | No exact Production SQL hash match |
| 20261028180912 | `test_only_harden_commercial_server_only_20261028` | 1233 | `667b6df954fbf6762e9c32d001d198d0e334249230e2d2b1d0a22310a056cf1e` | EXACT Production SQL match |
| 20261028180915 | `test_only_commercial_control_plane_20261028` | 6907 | `f845a5da877435fe954579ce6d6d4bdd33e6f291e5b3a3074878829dea36a464` | EXACT Production SQL match |
| 20261028180918 | `test_only_financial_reversal_hardening_20261028` | 702 | `85fe3a2ccdd239a4cd8aee06e16f96a3c65cec0be1a8ff6047f3b2ca586903f8` | EXACT Production SQL match |
| 20261028180922 | `test_only_commercial_performance_indexes_20261028` | 809 | `88c47e66688f5a330a5647ecbc4226be0f1603f13626ed51f2b0976af2d91a77` | No exact Production SQL hash match |
| 20261028180926 | `test_only_story_concept_submission_20261028` | 3022 | `c17ed3c119746159885730128f7927761066c5771ff7711c9f9428720fdb4727` | No exact Production SQL hash match |
| 20261029014139 | `test_bridge_workflow_schema_parity_20261029` | 5667 | `7ef1379f40bb21b00393373dad503f69235929813ec249588a92128b74a082d9` | No exact Production SQL hash match |
| 20261029014203 | `test_censor_certificate_metadata_versions_20261029` | 1746 | `dd25e91b7d473ea874c5d11d1684c3838adba625dc789932e657cc874fdc4ac9` | No exact Production SQL hash match |
| 20261030133503 | `testing_security_hardening_20261030` | 460 | `dc0a7dbca330a8d4a2f5954c4d31658d843807e906615c880df112443786380f` | No exact Production SQL hash match |
| 20261104203045 | `bridge_staging_data_api_lockdown_20261105` | 1025 | `77679bdc2e24b3fec0df2036ea3021c0bde1a38208feebba4f0afb01e8129e0a` | No exact Production SQL hash match |
| 20261104203415 | `bridge_staging_function_execute_defaults_20261105` | 282 | `0aa5c42b8b142dd2f9325ced4c8d8d3148d71329800eb1b5c82969281d6caaac` | No exact Production SQL hash match |
| 20261105084111 | `bridge_staging_identity_links_reconciliation_20261105` | 473 | `09fd6de89a3b9e0bf4f24584a4262b956406b1c3cf4c8eff773a5f98cab0612b` | No exact Production SQL hash match |
| 20261105143656 | `0018_bridge_rights_ready_submission` | 1476 | `41d14285c07bb2d43ff18ff7beaf129c9f1ff9a8d00162818fb56007c12750ff` | No exact Production SQL hash match |
| 20261106025823 | `bridge_testing_workspace_rls_20261106` | 9314 | `e2a4634780bda6987ae2062490e46bfb15f4402699ccb72be10caf3c5bf857b2` | No exact Production SQL hash match |
| 20261106025842 | `bridge_asset_storage_provenance_0022_20261106` | 982 | `7102ecf5d503285a3030e2cf9a46736d0c447e765602d5386562a5b4e1a56230` | No exact Production SQL hash match |
| 20261106031604 | `bridge_titles_no_browser_update_policy_20261106` | 73 | `73df73b94c105658b149bdf9466ca2a26f88299b84363bffd62ab0ecf50ad39e` | No exact Production SQL hash match |
| 20261106031723 | `bridge_server_authoritative_uploads_0023_20261106` | 6770 | `0d163f08bde74ba7bc06aff27944bc93e7ffd05e2a7c2f49062d0ea12bd7bdc7` | No exact Production SQL hash match |
| 20261106032656 | `bridge_workspace_verified_identity_guard_20261106` | 1003 | `47b80357a314b15aad194afde4eb59895379492b3383acdcdf86b1b12dcc201e` | No exact Production SQL hash match |
| 20261106051631 | `story_concept_atomic_idempotency_testing_20261106` | 1485 | `1d538b1f62e705e7626258b0cfbdbb01bc76487c4a1f6ec5f05d5d79a1162b4b` | No exact Production SQL hash match |
| 20261106063206 | `razorpay_webhook_processing_lease_schema` | 838 | `b4d9fed2cd8773c8269cb2483a175525feca61a415fb2a782bcef886f29e6014` | No exact Production SQL hash match |
| 20261106083338 | `revenue_distribution_intelligence_20261106` | 3783 | `52c58ddd3942046ec65334cb9e29ae08a0e72f6c7286f8dbd9ca6b7959e1286b` | No exact Production SQL hash match |
| 20261106083617 | `20261106_story_concept_buyer_mandates` | 3260 | `bb5ddd11b1cd5b612f41c65a2b80d4e38b2d940fe3c0bfbf8b26d2d0484e09bc` | No exact Production SQL hash match |
| 20261106084908 | `20261106_story_concept_buyer_mandates` | 3500 | `d601e65f862c72e9b7b19bed659fba102be643d65cbe9b4e09434fce9c78ccd1` | No exact Production SQL hash match |
| 20261108222208 | `grant_authenticated_usage_bridge_private_schema` | 54 | `4e20af273893406314375bc84cc138e46442c765d18ac377e24ffef620df8edd` | No exact Production SQL hash match |
| 20261109124007 | `staging_film_content_owner_leads_20261109` | 1478 | `7d4e88cdaae600cc263e83925752ce872399a05db4e5e694e89d1f332c0a9bde` | No exact Production SQL hash match |
| 20261109134919 | `buyer_requirement_intelligence_private_20261109` | 4974 | `02cc59465e0ab121be93baa232deb6e43b679c188b45a5b4fb2905eeebfd482f` | No exact Production SQL hash match |
| 20261109135114 | `buyer_requirement_foreign_key_indexes_20261109` | 221 | `171eed564faa4e07fb4fff531e84c09489956c0758a478646f835695d440672a` | No exact Production SQL hash match |
| 20261110183356 | `staging_bridge_role_rpc_and_multi_studio_membership` | 1007 | `17151a8cb651f27f0604a10488057bd0ef3ca02e4fc6f03b50bc77e87d216186` | No exact Production SQL hash match |
| 20261110183454 | `loop_runtime_tables_and_atomic_tvod_fulfillment_staging` | 13193 | `61a2f99019512a0ba60812cba50e4c4d4c320d75f86a4983bdfe9ed5fc1cb435` | No exact Production SQL hash match |
| 20261110183528 | `staging_server_only_deny_policies_and_loop_minimum_grants` | 1434 | `661bc61e4b2b07a48e9943e76b971e72eb3a9fc2a740e136b7f1733647ffe2fd` | No exact Production SQL hash match |
| 20261110183943 | `loop_watch_progress_authenticated_own_rows_only` | 819 | `1942cdebbe8587d7c0b73a1033beac9a09c7e5cb292594dcc49d88d51fc767ac` | No exact Production SQL hash match |
| 20261110184842 | `bridge_multi_studio_membership_lookup_index` | 304 | `92ac4d88673b9c5b043a4573d6cd47a2c1dc8d9ab92853df43731397aacce302` | No exact Production SQL hash match |
| 20261110193739 | `bridge_rights_evidence_verification_0021_staging` | 10983 | `bff7997f1b429492cf9d5e1ef8d9a99807d205b99bd72c01693b487149b8930b` | No exact Production SQL hash match |
| 20261111100344 | `loop_public_catalog_rpc` | 2238 | `391d78a3f6c7787f36524f8a94a1ffc22cbf1dd7bd02d55b0a3643a4b406a071` | No exact Production SQL hash match |
| 20261111100648 | `loop_tvod_entitlement_rpc` | 657 | `18d6f518f8be8c2c96a2fcb27a7b92b4eded98139f6a74fe9055e746fe70663f` | No exact Production SQL hash match |
| 20261111101656 | `20261111101500_loop_public_catalog_and_tvod_entitlement_rpc` | 3151 | `3d94bf92b932bea2a06ac087fd5c3505117014776f895083a4e9b51e02f5ac88` | No exact Production SQL hash match |
| 20261111101742 | `loop_rental_fulfillment_readiness` | 796 | `3f87b55a1743bab735cae955817004ebdd278ed2a01be5e4d8a5a70a384f0ce4` | No exact Production SQL hash match |
| 20261111102654 | `20261111102000_loop_rental_fulfillment_readiness` | 708 | `73c06e643a4f56db9d194521f6e171986ae9ea3bef110ad970b6167d916d3719` | No exact Production SQL hash match |
| 20261111110755 | `streamvista_customer_intake` | 6125 | `ec47e78b91b6d2edebb2c7a0f6d464ccae29e5c91981c2408fdb380b1e682b69` | No exact Production SQL hash match |
| 20261111111042 | `streamvista_private_project_storage` | 1946 | `44e1af1c81b5d8cb54ed9c3d1a2e29dd9ea2a249839507a934722c14ebd6f60e` | No exact Production SQL hash match |
| 20261111163440 | `buyer_acquisition_mandate_legal_scope_20261111` | 4777 | `1b43f7b3dce7bb2ee18de3416ff499cea9175b01d832e197dceed4af2e31ee83` | No exact Production SQL hash match |
| 20261111163555 | `buyer_organization_legal_verification_20261111` | 3937 | `2060bb8562913cb726feecb6963cf8fc0a698b11e7463b2a5f902a8ac6a5b217` | No exact Production SQL hash match |
| 20261114075718 | `bridge_dit_ingest_testing_20261114` | 3839 | `eb287c589ce7f7ff344fa82c3b1600cc72bb00d086a54ee1655959d38b577294` | EXACT Production SQL match |
| 20261114093221 | `bridge_site_content_cms_20261114` | 1102 | `b6b366498c674b0c602e7a25b017bc5ea2ff1845f840092027ce92c43e84a5f8` | EXACT Production SQL match |
| 20261116082227 | `20261115220000_bridge_production_documents` | 3708 | `0f2c7096374587ee4c2a4c03ce6874c66ccc9dec86b22e46012216c982023aa5` | No exact Production SQL hash match |
| 20261116082234 | `20261115221000_bridge_production_owner_rls_helper` | 1945 | `3afde622760e4cb3049277082c28185f309a5ba458e2378ca6a0b9f0763ac7b2` | No exact Production SQL hash match |
| 20261116082236 | `20261116083000_harden_bridge_title_owner_helper` | 1014 | `a9cb95d944e7b98825be2094e0d2bdee00abe163aad2999ab5ba70e2633a0498` | No exact Production SQL hash match |
| 20261116111314 | `secure_public_loop_catalog_testing` | 2275 | `87df8348d4791d070200d9c8e3f5b39453267b2be9d68b43fb30d331acbbc044` | No exact Production SQL hash match |
| 20261116111344 | `grant_public_loop_catalog_invoker_reads_testing` | 196 | `f74ae90e08c58565bf3ba3083e7e6cf2e67475393d02acbaf1f2405ae9821b45` | No exact Production SQL hash match |
| 20261116111454 | `normalize_public_loop_catalog_schema_testing` | 3240 | `0743fbf6a6b87f7121d1550a51f74c5e1728663169e2769195c79a25408002fc` | No exact Production SQL hash match |
| 20261116111631 | `restrict_public_loop_catalog_rpc_to_edge_service_testing` | 364 | `87caf56dc37f236e3374b9d41e9b4ef2e37a35fcca7eec01a4babd54bf9e8e65` | No exact Production SQL hash match |
| 20261116210822 | `bridge_title_hold_block_controls` | 3551 | `90cf5c9a8899e43143e0d1bc414bda550f3c558b00439dabfb2b8aa1361a8e3a` | No exact Production SQL hash match |
| 20261116224138 | `loop_viewer_profiles_20261117` | 1704 | `de3610086b16e6401557764c5e251b8b579ed1eebd50b05ad7551cf132f81846` | No exact Production SQL hash match |
| 20261116224140 | `loop_watchlists_20261117` | 1310 | `677b2b2cf9453b12dbe89876ac4f9aa814eba4d8fd1580da5b8d7d81a2576fc4` | No exact Production SQL hash match |
| 20261116233444 | `streamvista_legacy_links_unresolved_resolution_state` | 1634 | `ae8ef1ccf6dff166c34dc66f2350e974a57e14624b590a497d323bfe5bb2be57` | No exact Production SQL hash match |
| 20261116234234 | `harden_legacy_links_service_role_privileges_20261117` | 315 | `64197182edca4bece2c4d5b2de4ed6e52f514a3c45fd442a189a4b9d05e84fb1` | No exact Production SQL hash match |
| 20261116234306 | `bridge_legal_consent_evidence_20261117` | 1704 | `9c90560ff4a0c7f3947d02a54c02469b0c4c8d9595924e05f524526d295c9402` | No exact Production SQL hash match |
| 20261118000102 | `bridge_dit_storage_objects_20261114` | 1844 | `a7cdac61dbfa1c7e100e5a103d3f71eed34e657870a961d6ad39018a823a571f` | No exact Production SQL hash match |
| 20261118000214 | `bridge_production_schedule_20261118` | 1859 | `a9d0c533e8386cb92f3549316c4a240e9c2c027d5d4bbf459d3e7c6e5dbe9c20` | No exact Production SQL hash match |
| 20261118001111 | `bridge_studio_invites_and_owner_transfer_20261118` | 3077 | `b92976971e05edae1d02fc18381cdbb7e00a7789a5720f97edde0a9b982e6472` | No exact Production SQL hash match |
| 20261119093620 | `bridge_creator_document_vault_20261118` | 3066 | `d57e8ede271c87e055d99ce3e2186229a12787ae59bf84e6aa88d6aa2af64a65` | No exact Production SQL hash match |
| 20261119093624 | `bridge_exclusive_sublicensing_authority_20261119` | 2230 | `82b94ba615dea26df631e60ec2e5edec76256a052ff769a1a0ecc1d2ff48f3b3` | No exact Production SQL hash match |
| 20261119203532 | `20261120110000_bridge_story_concept_rights_review_workflow` | 2318 | `2ee6a2010197af776c5d58b57a12ca1c7fce791e3d044437c5985d03c9e4956b` | No exact Production SQL hash match |
| 20261119211802 | `malayalakkara_conditional_submission_test_only` | 1008 | `b91c510e41d07d39aa3764a9b005b4685dac3ff6a307d8e82474194e5bd3ed0c` | No exact Production SQL hash match |
| 20261121041513 | `20261121_private_title_owner_rls_helper` | 2120 | `1ea7ae50a08f089c06f4664628c7e70422f5b8870708d2742ecf48ed2c12ed18` | No exact Production SQL hash match |
| 20261121042851 | `secure_production_asset_owner_helper` | 1839 | `6fb227b87fd80762f55082fe6a8066835ba6d3ce78f706aafac0615395076523` | EXACT Production SQL match |

## Interpretation and next gate

- Testing migration SQL evidence is now **FOUND in the Testing DB ledger**; a separate SQL archive export is no longer required to begin exact hash mapping.
- The repository's lack of a Testing SQL archive remains true; the DB-resident `statements` array is the authoritative evidence inspected in this step.
- 7 rows have exact Production source SQL identity.
- The other 63 rows require a per-migration DDL / policy / grant / function / trigger / dependency / ordering comparison against the current Testing catalog and app call sites. Do not infer equivalence from names or treat every unmatched row as Testing-only.
- The duplicate name `20261106_story_concept_buyer_mandates` remains two distinct migration versions and two distinct SQL hashes; preserve both records separately.
- TVOD source compatibility remains **FAIL**: the two active feature-candidate migrations do not hash-match a Testing ledger statement, and the already inspected checkout/webhook call graph still conflicts with the Testing schema/RPC contracts.
- Disposable local replay PASS remains separate evidence; it does not certify hosted Testing parity or Production.
- No hosted Testing writes, no Production operations, no merge, and no deployment promotion are authorized by this documentation update.

## Status

- Testing DB SQL-body retrieval: **PASS** (READ-ONLY; 70/70 statement bodies present).
- SQL hash inventory: **PASS** (70 SHA-256 values recorded).
- Exact Production SQL matches: **7 PASS / 63 no exact match**.
- Semantic migration mapping for 63 unmatched rows: **NOT VERIFIED**.
- Testing vs source schema parity: **NOT CERTIFIED**.
- TVOD app compatibility: **FAIL**.
- PRODUCTION: **HOLD / NOT CERTIFIED / NO-GO**.
