# STAGING migration reconciliation — 2026-11-11

## Scope and method

- Target: Supabase STAGING / Testing DB `jbymleftneggcgutlcqu` only.
- Production project `mlmgugivsyoxzdgwkbpu` was not modified.
- Applied SQL is read from `supabase_migrations.schema_migrations.statements[1]`.
- `applied_sql_md5` is PostgreSQL MD5 of `array_to_string(statements, E'\\n')`.
- GitHub source/snapshot SHA values are Git blob SHA-1 values.
- `EXACT` means byte-for-byte match. `TRIM-EQUIVALENT` means SQL text matches after removing only the final newline.
- `SNAPSHOT` means exact applied SQL is preserved under `docs/evidence/applied-sql-snapshots/`; original source-file provenance was not found in the current repository tree. Snapshot files are audit evidence only and must not be replayed.

## Applied migration inventory

| Version | Applied name | Applied SQL MD5 | Source provenance |
|---|---|---|---|
| 20261028180816 | test_only_bridge_core_baseline_20261028 | 999312a09501bf6a3e69dbc9c8e5b5ed | EXACT — `migrations/0004_bridge.sql` · blob `3ddc50742490c102e08e8a123aec203ef0188d8d` |
| 20261028180834 | test_only_bridge_rls_20260921 | ab54676e6b0b6da091daf8040022496e | EXACT — `supabase/migrations/20260921_crayons_bridge_rls.sql` · blob `c6f51bff1aceaf8b8e1e65df83ef04ea15b88c39` · file header names a different project/auth model; do not replay outside this test history |
| 20261028180856 | test_only_bridge_assets_censor_certificate_20261004 | 6bd43955570f1a93574c115930161c39 | EXACT — `supabase/migrations/20261004_bridge_assets_add_censor_certificate.sql` · blob `d9d0dca298e4da87ab57a6032d576f5fa15a34e6` |
| 20261028180900 | test_only_bridge_commercial_engine_20261006230000 | 1a388b2f4183da815b675ea86e8aaba0 | EXACT — `supabase/migrations/20261006230000_bridge_commercial_engine.sql` · blob `cd303761295770ec63ec9421b403a65e804db66a` |
| 20261028180907 | test_only_duplicate_title_reconciliation_20261028 | ff654e952729e33b586f6a2af07a4885 | EXACT — `supabase/migrations/20261006230000_duplicate_title_reconciliation.sql` · blob `bb78eab457765cf0f2250938e8d64eb9c2919fa5` |
| 20261028180912 | test_only_harden_commercial_server_only_20261028 | c53fb59ec77848efc3ae4af2584c7e32 | EXACT — `supabase/migrations/20261007000000_harden_bridge_commercial_server_only.sql` · blob `2bef15bb0a185afebca31fdeba8b816d6b575ae1` |
| 20261028180915 | test_only_commercial_control_plane_20261028 | 1bde19c1b7d2e6bbcda51ee86cdb887c | EXACT — `supabase/migrations/20261007013000_bridge_commercial_control_plane.sql` · blob `e5710413945137ac471319ada82d1a129e0545e0` |
| 20261028180918 | test_only_financial_reversal_hardening_20261028 | dd60953c3a722560f7f96254f1260314 | EXACT — `supabase/migrations/20261007020000_bridge_financial_reversal_hardening.sql` · blob `f05972a592ca4569d161ddd8f6c43cc0517f69d5` |
| 20261028180922 | test_only_commercial_performance_indexes_20261028 | c596b5748f70c2d3636cdbb4f8106fe3 | EXACT — `supabase/migrations/20261007023000_bridge_commercial_performance_indexes.sql` · blob `2f2fd8b30ade126891a0e4a1621ad7084727c182` |
| 20261028180926 | test_only_story_concept_submission_20261028 | e9d8cc7188d1bb1b691bd8e48589117d | EXACT — `supabase/migrations/20261027_story_concept_submission.sql` · blob `6f540304c006ba7529c1217fdb3d097b6bd35810` |
| 20261029014139 | test_bridge_workflow_schema_parity_20261029 | eba2ecce8632aa604d9d7036a5b34d75 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261029014139_test_bridge_workflow_schema_parity_20261029.sql` · blob `85a8cdfc82397a992beeb7062c6dc96d7cc68f8a` |
| 20261029014203 | test_censor_certificate_metadata_versions_20261029 | 652ecbf939c1fa6857f5b87f5eac0940 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261029014203_test_censor_certificate_metadata_versions_20261029.sql` · blob `0adaf14a33bcf3f862b0659721b1c61d4c34af3b` |
| 20261030133503 | testing_security_hardening_20261030 | 81380afbf1bbb7823d0f9942e2c16bae | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261030133503_testing_security_hardening_20261030.sql` · blob `faf5e0039f9fafb8432fab7a7cbc77a7a0e9d6bf` |
| 20261104203045 | bridge_staging_data_api_lockdown_20261105 | 28adb5d3e173367948fdcc8dd849d49b | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261104203045_bridge_staging_data_api_lockdown_20261105.sql` · blob `acde62af3ff9ceafa4b1dc73551b45254c7b9e58` · candidate `migrations/0008_bridge_data_api_lockdown.sql` is not byte-identical |
| 20261104203415 | bridge_staging_function_execute_defaults_20261105 | 7600b57e0a655a27e031f69b605008a4 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261104203415_bridge_staging_function_execute_defaults_20261105.sql` · blob `5b7f3f5e51116091a6bf4ab7604637a24d9500de` |
| 20261105084111 | bridge_staging_identity_links_reconciliation_20261105 | 04548f0e01c9dd977723aecddb5d1557 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261105084111_bridge_staging_identity_links_reconciliation_20261105.sql` · blob `6f1ecae9f595f305db9eb3a0e5c2611e6d6d2d0a` · candidate `migrations/0007a_identity_links.sql` is not byte-identical and references legacy `public.user` |
| 20261105143656 | 0018_bridge_rights_ready_submission | e0ba21b942bbd4aa15d234f753f68895 | TRIM-EQUIVALENT — `migrations/0018_bridge_rights_ready_submission.sql` · blob `b788e9ab35ac1d61d98f644f268a4708b31e6ffd` |
| 20261106025823 | bridge_testing_workspace_rls_20261106 | a533a4b9522b5c142180eb66a95ebadd | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261106025823_bridge_testing_workspace_rls_20261106.sql` · blob `0610c1777b12bfcdfb79a46def810ca09a739209` |
| 20261106025842 | bridge_asset_storage_provenance_0022_20261106 | c23005a832821c913a1e473888d5c7b3 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261106025842_bridge_asset_storage_provenance_0022_20261106.sql` · blob `495089f6a58f603615ed7c81c2412a6c29b36cf9` |
| 20261106031604 | bridge_titles_no_browser_update_policy_20261106 | 62f4c6aa38f1821da1fe3c93f0e7f54c | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261106031604_bridge_titles_no_browser_update_policy_20261106.sql` · blob `511911d6e5ad438c82094bce8ad8088293fe1367` |
| 20261106031723 | bridge_server_authoritative_uploads_0023_20261106 | 138f9191fa5c8088205c8dfb571175bc | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261106031723_bridge_server_authoritative_uploads_0023_20261106.sql` · blob `d8f5cc89729921ce19446232c45dcd56d34a0f9b` |
| 20261106032656 | bridge_workspace_verified_identity_guard_20261106 | 5e2dd078fa415c727c7f961ee2c1bb93 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261106032656_bridge_workspace_verified_identity_guard_20261106.sql` · blob `cef156af1cd2cbaae09ee305c2faf22f16fb57b6` |
| 20261106051631 | story_concept_atomic_idempotency_testing_20261106 | e12902db63885903db165155f7bb52e1 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261106051631_story_concept_atomic_idempotency_testing_20261106.sql` · blob `5180b6bf56ef042ab5e69b2bcf836b6cef0e0c03` |
| 20261106063206 | razorpay_webhook_processing_lease_schema | 60164e58b822dae98a03af26655d6c77 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261106063206_razorpay_webhook_processing_lease_schema.sql` · blob `e5cb314e163d38c84faefb99387104a69d23bd1d` |
| 20261106083338 | revenue_distribution_intelligence_20261106 | fd9917c46cbc470d6ece645c98d1cf8f | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261106083338_revenue_distribution_intelligence_20261106.sql` · blob `b8ec2d5ae42fea5fb1d23c600107628f73529154` |
| 20261106083617 | 20261106_story_concept_buyer_mandates | 5ad8990d3db9206c81d2b3a0cdb81e78 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261106083617_20261106_story_concept_buyer_mandates.sql` · blob `3d18bb1d1ca838eaf34fe39aedd917603e7806ca` · duplicate name; distinct version and SQL hash |
| 20261106084908 | 20261106_story_concept_buyer_mandates | 3bd69fad37c374cc93e3ac15f4e3b616 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261106084908_20261106_story_concept_buyer_mandates.sql` · blob `2043f8db08f7d3d30d591dee76c4e3f38529164b` · duplicate name; distinct version and SQL hash |
| 20261108222208 | grant_authenticated_usage_bridge_private_schema | 48d5890496891bef99090065351c76f0 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261108222208_grant_authenticated_usage_bridge_private_schema.sql` · blob `4117319ae55fb151937d513ca64fbf689417626e` |
| 20261109124007 | staging_film_content_owner_leads_20261109 | 78b4615b21c05847b77d62eeb3dda527 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261109124007_staging_film_content_owner_leads_20261109.sql` · blob `f8ac4d3448fcd1f9a4bed1a0645e8dfe3ea70037` |
| 20261109134919 | buyer_requirement_intelligence_private_20261109 | d5d3289691f3cd847f2c8a1e799762f9 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261109134919_buyer_requirement_intelligence_private_20261109.sql` · blob `11855489afe13623b3406d062428b8689dc7db74` |
| 20261109135114 | buyer_requirement_foreign_key_indexes_20261109 | 1fe87ff1c6ce961d2053cb6d1d0f0a07 | SNAPSHOT — `docs/evidence/applied-sql-snapshots/20261109135114_buyer_requirement_foreign_key_indexes_20261109.sql` · blob `d7ea87585d41b48bce8654b8a74c4071e10fd338` |
| 20261110183356 | staging_bridge_role_rpc_and_multi_studio_membership | f6d9022876d43a66e14bad397a4cb9d0 | EXACT — `supabase/migrations/20261110183356_staging_bridge_role_rpc_and_multi_studio_membership.sql` · blob `d0eecab490390fbaab21b75260117ec4b062f5bc` |
| 20261110183454 | loop_runtime_tables_and_atomic_tvod_fulfillment_staging | 142b7d695b11899898d0e97552e68c69 | EXACT — Loop repo `supabase/migrations/20261110183454_loop_runtime_tables_and_atomic_tvod_fulfillment_staging.sql` · blob `18fdef16b4a56b1ebe393d300877744bdf26b86d` |
| 20261110183528 | staging_server_only_deny_policies_and_loop_minimum_grants | 373a396e4ae9940feb815243a0d9710b | EXACT — Loop repo `supabase/migrations/20261110183528_staging_server_only_deny_policies_and_loop_minimum_grants.sql` · blob `de3a54f6dfead0c3e6d355e40a2a596b3b80d460` |
| 20261110183943 | loop_watch_progress_authenticated_own_rows_only | 2de78af5680aeba3ec18a8de30286781 | EXACT — Loop repo `supabase/migrations/20261110183943_loop_watch_progress_authenticated_own_rows_only.sql` · blob `ceceec0697b80d2f1c39ddee1e2f00b62387347a` |
| 20261110184842 | bridge_multi_studio_membership_lookup_index | b7fd72e24a3dc325a06128e63c075f24 | EXACT — `supabase/migrations/20261110184842_bridge_multi_studio_membership_lookup_index.sql` · blob `8f81f940eda31022779b26d07dd10b0f6bf145a2` |

## Reconciliation result

- 36 migration records currently exist in STAGING.
- The original 31 records are preserved; no migration history row was edited or deleted.
- 10 original records are byte-exact source matches; one original record is SQL-equivalent except for the final newline.
- 20 original records had no byte-identical source file in the inspected Bridge/Loop repository migration trees; their exact applied SQL is now archived as audit snapshots.
- The two buyer-mandate records retain the same name but different versions and SQL hashes; they are not duplicates to be collapsed.
- Every migration record currently has zero rollback statements in Supabase migration history. Guarded `.down.sql` files for the five new migrations are stored beside the new source migrations; they have not been executed.
- No historical migration was replayed or rewritten.

## Do-not-replay warnings

- Snapshot files are audit evidence, not deployable migrations.
- The exact RLS source file at version `20261028180834` contains a project/auth-model header mismatch; do not replay it in Production.
- The legacy identity candidate `migrations/0007a_identity_links.sql` does not match the applied identity reconciliation and references `public.user`; use the archived applied SQL as evidence only.
- The legacy `migrations/0006_loop_canonical.sql` contains sample publication/playback data and must not be replayed.
