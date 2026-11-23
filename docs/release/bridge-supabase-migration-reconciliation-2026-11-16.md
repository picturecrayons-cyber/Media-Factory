# Crayons Bridge Production migration-source reconciliation

- Source: Supabase Production `supabase_migrations.schema_migrations`.
- Project ref: `mlmgugivsyoxzdgwkbpu`.
- Snapshot date: 2026-11-18.
- Historical Production migrations restored to active `supabase/migrations/`: **70**.
- Additional post-snapshot Production rollout migration: **1** (`20261123015009_bridge_owner_submission_production_rollout.sql`).
- Total Production replay migrations: **71**.
- SQL bytes: **159668**.
- The 70 historical SQL files preserve the exact stored statement text joined with LF, including trailing spaces and newline characters. The additional Production rollout migration is authored separately and has its own exact byte-count/SHA-256 manifest entry.
- The additive `bridge_master_language` migration (version `20261118123335`) was applied to canonical Production project `mlmgugivsyoxzdgwkbpu`. Read-back confirmed the column exists; all 42 existing title rows retain `master_language = NULL`. No `language` values, title rows, asset rows, or OCI objects were changed.
- The local replay temporarily removes the active migrations directory while `supabase start` bootstraps managed services, then restores it for the script's controlled one-by-one replay. The script asserts that the local Supabase migration ledger is still empty before applying the 70 files itself.
- Production catalog read-back confirms RLS is enabled on every `public.bridge_%` table. Four core client-readable tables also have explicit `authenticated` SELECT-only identity/owner policies: `bridge_profiles_self_select`, `bridge_titles_owner_or_buyer_select`, `bridge_identity_links_self_select`, and `bridge_buyer_title_access_self_select`. Because the 70 SQL statements do not fully capture this current baseline, the local replay reconstructs the verified RLS/GRANT/policy state after the 69 migrations. It enables RLS on all local `public.bridge_%` tables and asserts that none remain unprotected, and verifies that each core policy is restricted to `authenticated`, binds to `auth.uid()`, and enforces the correct self/owner/buyer relation. These statements execute only against the disposable local CI database; they do not change Production.
- CI pins the disposable local Supabase API/database/shadow ports to `55431`/`55432`/`55430` in `supabase/config.toml` to avoid runner port collisions. The replay script accepts only local Postgres at `127.0.0.1:55432/postgres` and rejects every other host/port.
- Production contains a pre-ledger parental-controls baseline absent from the 70 recorded SQL statements: `public.loop_parental_controls`, its RLS deny policy, lock index, and `public.loop_parental_controls_set_updated_at()` function/BEFORE UPDATE trigger. The live table has one row; replay recreates only its schema/security baseline locally, never the row.
- Production also contains a pre-ledger Delivery Desk table `public.bridge_delivery_jobs`, absent from the 70 recorded SQL statements. Read-only catalog checks confirmed its UUID primary key, cascading title FK, job type/status checks, indexes, RLS enabled, and authenticated-only `private.bridge_is_internal()` policy. It currently has zero rows. The replay script recreates only this empty table/security baseline before migration `20261114135437_bridge_delivery_job_ownership_20261114` adds requester fields and its index; no Production rows are copied.
- Production also contains a pre-ledger Story/Concept baseline absent from the 70 recorded SQL statements: `bridge_titles.submission_type`, `public.bridge_story_concept_submissions`, and `public.bridge_buyer_interest`. Production read-back confirmed the Story/Concept table's two RLS policies (anonymous deny and authenticated owner-only), its schema/indexes/constraints, and a row count of three. The 13 November recorded migration `20261113090257_bridge_story_concept_nonrow_privileges_20261113` later removes TRUNCATE/REFERENCES/TRIGGER client privileges from that table. Replay recreates the schema, policy, and role-grant baseline locally before that recorded migration; no Production Story/Concept rows or buyer-interest rows are copied.

## Remote version manifest

| Version | Name | SQL bytes | SHA-256 |
|---|---|---:|---|
| 20260925141006 | create_legacy_import_schema | 5132 | `3acbcbd468f5548961115a5330ee1dcc31fb1a86710a67f82d12a01e219ae94a` |
| 20260925170237 | bridge_auth_schema | 1661 | `4976e9459298d9aceac9d7b0e2b32db95a6bb73f04784eb2ab27f9c1da7fb50b` |
| 20260925170239 | bridge_operational_schema | 4428 | `3860f2568f616d9fb247319d1f598b292f3398b4424e7cf834cf9e92e775d29f` |
| 20260925170241 | bridge_webhook_retry | 159 | `49d54d237c8d46559808c37d400a3fd180df987bded1b8dd4bd98b764320d0bd` |
| 20260925170308 | bridge_fk_indexes | 175 | `1a7478468dd400d0c217f144966e6064e7fd843a6c970869c32219984c97ef89` |
| 20260925193451 | bridge_webhook_processing_token | 81 | `59549a627b48ecc495bb442ff63c2065382dadd02c7136bc8ca3f1f2fa1e9453` |
| 20260925214917 | loop_canonical_runtime_baseline | 4312 | `f121fb1aad3f2394d4edf699802d3e4aadccb4803d582a014ae44c7102c4fb62` |
| 20260925214936 | loop_runtime_rls_and_plans | 1638 | `b0bd3f16c1faf0898f4671a546f719a3783c576b6753b6c6f1ecea67c904f0df` |
| 20260925220714 | bridge_loop_verified_identity_links | 800 | `0c589eae37cd55e9dac9780f38255da74334331fd9f34cc167d1de52b331c8a0` |
| 20260926045625 | loop_payment_events_own_read_policy | 143 | `b9cec174cba5fe29f6f829285865561e4c70bcbab1df61740918af0021610c13` |
| 20260926054626 | add_poster_studio_schema | 2159 | `9c80f7493cfdcab2539b6a6399e84dc7602e38987b82cdf35f7654b14cee1224` |
| 20260927094608 | harden_server_only_grants_and_fk_indexes | 835 | `d602cb7e83fd2d1be793e0390e80b065e93b29d1204398314bd517cfc2a5eae9` |
| 20260927114947 | streamvista_media_os_service_pipeline | 3227 | `86a47f430a6080c3a335dee9430cc5cc6cf7175376ad0dd0dcf8e3ba35dbe9e0` |
| 20260927215559 | bridge_data_api_lockdown | 1815 | `fffc60481a949c17394e25657055aada4178996b4f3c1e92135233b0dc9065f4` |
| 20260927215742 | bridge_buyer_title_access | 817 | `c69274da04414f133e20a65ec9779d219f95ac64cbc1819718bbe4acc71d4227` |
| 20260927215758 | bridge_buyer_title_access_20260928 | 817 | `c69274da04414f133e20a65ec9779d219f95ac64cbc1819718bbe4acc71d4227` |
| 20260928102539 | bridge_profile_welcome_email_marker | 94 | `bdb754ddf7bd9acf9470a07a8a0173ada6d1e8e7c5db27b90397573d3a01d013` |
| 20260928120120 | bridge_prd_phase1 | 5434 | `80eb214b7d0d1f21f717693eabc07c8163424cdd32d6299fe48076a6f1fe7ef1` |
| 20260928154653 | bridge_auth_protected_read_policies | 2065 | `67805b174abb5a178c53e661cfbe7a889694448aa7fe9b760730b0e1ed121256` |
| 20260929154225 | bind_bridge_rls_identity_and_read_scope | 4776 | `0ad7f982836cd96e8f1b9a99148be1b73c3d510828ca4787a25a86d69bffed44` |
| 20260929162737 | harden_bridge_rls_helpers_rpc_surface | 378 | `4f838e73bfdfec04632f03b699f12f55f9c55dae74e3ba2ba4f4f87b92f780f5` |
| 20260930092721 | grant_authenticated_bridge_current_internal_role | 157 | `8f574f78ec70ec5b95a88e244fecbe7070a49882cbd7b2b1ddbdb8f5626ec6ab` |
| 20261002171708 | loop_release_safety | 7250 | `dccc2067ba070df8470d58f97b40916485b6dec73078708282e3b430e1cfaa6f` |
| 20261004051643 | loop_semantic_search | 1252 | `29f311d86b1c0c152de443497d8a9738189580fe14fb70a77d6ae1cb79d5784c` |
| 20261004052641 | move_vector_to_extensions_schema | 85 | `2f7c56beb9828474e461db03c6f4dc0d96c54c272e474f3ba8c0233aac1fdff5` |
| 20261004052646 | rebind_loop_semantic_rpc_vector_schema | 784 | `54e83590f68231e89b407c55090a0ac55d5a3bf8dca79f43ff03d24068be30bc` |
| 20261004102348 | delivery_trace_finance | 4003 | `7477570a8184498be543e14efa8ac0a46b15510c3e4ee3f4195d7a79a7724a5a` |
| 20261005112318 | investor_account_type_20261005 | 264 | `1acee8f45b656b9ff86c2485099a2413126fe776721cad06d67e2d888a11227f` |
| 20261005124904 | bridge_dmca | 601 | `00ae889cf5588928447de5e2445315de9672aae83ec03fbc290316d380ce4415` |
| 20261005125643 | lock_down_bridge_client_grants | 952 | `22dee2bc868c7c989f7a97b3285933694306b0aa0a460de43268e2da8eadcf35` |
| 20261005125847 | explicit_deny_policies_for_internal_tables | 527 | `e916967de0572efaf2125891a29a31f72606a81a91a34ea03c9f7d67e12bcd18` |
| 20261006100425 | allow_bridge_supabase_auth_onboarding_verification | 428 | `e4d6bcd5eb675017c7ac4f5ea752b7ee4928d3da570c8cdf8f89eefd3bbbf394` |
| 20261006152111 | bridge_buyer_publication_gates | 2954 | `937180dd985a36aad32770fa00b59a2148f94b69b3e8fbdc85ff3a8ad95705e0` |
| 20261006154551 | harden_authz_server_only_surfaces_20261006 | 457 | `4578d563cb1f8f9ee187da5af9f83f49614a13effcedf8339967656813601e41` |
| 20261006154553 | legacy_creator_intake_20261006 | 554 | `475fbbf4188607c254f051cf221afd91f6c62b3e968fe81631f5153f7ec9a0d7` |
| 20261006185556 | bridge_commercial_engine_20261006230000 | 28612 | `886e50d73abbf7a5c444ee6a873e2bb25aa067ef2ea3690fc3edc8b3ce7464f9` |
| 20261006185640 | harden_bridge_commercial_server_only_20261007000000 | 1233 | `667b6df954fbf6762e9c32d001d198d0e334249230e2d2b1d0a22310a056cf1e` |
| 20261006195531 | bridge_commercial_control_plane_20261007013000 | 6907 | `f845a5da877435fe954579ce6d6d4bdd33e6f291e5b3a3074878829dea36a464` |
| 20261006195536 | bridge_financial_reversal_hardening_20261007020000 | 702 | `85fe3a2ccdd239a4cd8aee06e16f96a3c65cec0be1a8ff6047f3b2ca586903f8` |
| 20261006195607 | bridge_commercial_performance_indexes_20261007023000 | 807 | `b9a201149a918b46d67f8c474d10abc6d9c2b5d3fef6773d5f266a43ea69221e` |
| 20261006231321 | deep_clean_server_only_rls_20261007 | 2298 | `3ee77bc17943dce28e90203a986383a0b8de60de40005953081e2db992f96876` |
| 20261008031103 | loop_watchlists_20261008 | 1313 | `a765486f22fcf128557ff5b46e7e72ed9d5caab52a69822fe54adbe4cf53a913` |
| 20261008050017 | p0_bridge_catalog_deal_room_reconciliation_20261008 | 2083 | `394182de61d916a98f32c4923a2f0eb18397f52338eefce9bde8ec6358b00f2a` |
| 20261008053655 | p0_bridge_catalog_deal_room_reconciliation_v2 | 1636 | `c23e5b8e54c36372dbfa081a8f8856feaac085fe11e861e448c3b758fee1946f` |
| 20261008053658 | p0_bridge_title_catalog_columns_v2 | 540 | `431564ebd7f14b78ad95ab7e3dee355fd287435424902c5a2993633eda5d48ca` |
| 20261008053700 | p0_loop_catalog_pranayam_visibility_v2 | 199 | `7d37b7f48a7b25464adf9684bcc2e336f539dc20e0750e37ed1db92fdfbdf59a` |
| 20261008113911 | reconcile_duplicate_title_merge_gate_20261008 | 2398 | `9f5272bd1df31d5e7abf7913a4df8f2db18f6660b5628b7393a5d82790316555` |
| 20261008122836 | enable_merge_table_rls | 144 | `e30645aa73bbdc13386e518c3ed5eb852826d4be0f67dbc6473008ab5407b8ae` |
| 20261009210503 | bridge_rights_ready_submission | 1380 | `351af683aa6e38247caa1318bc29d1ad64bc2dd6c168ae48f927d1f5d52dd573` |
| 20261009210645 | bridge_submission_intake_server_only | 339 | `edc98c6dc7c49314113a72ab06fea445933c321ad16ff2d3520701e57ee4f905` |
| 20261011041046 | bridge_storage_economics_20261011 | 2055 | `8b97f2b4b5ac89298f8f0a219e975923d8942d1d0ead29f3ad843acdf5de300b` |
| 20261016161255 | bridge_assets_kind_constraint_20261016 | 474 | `9ea83065f333934812b3bb5a58d9e181123906d5e116a396b7af69fc7b420573` |
| 20261113090250 | bridge_studio_organizations_20261113 | 2689 | `1952eff7676ab6907a2965e0f58944347742a8e72e8be2a6670a2677903d593b` |
| 20261113090257 | bridge_story_concept_nonrow_privileges_20261113 | 269 | `3c5ee38d1d07fd5f6c644f0b17aa2c7fd53655158eb0a0d55fe6aa822d701b59` |
| 20261113090449 | bridge_studio_member_role_vocabulary_20261113 | 478 | `ba8d82f4ba1bf5ddbd95d0d5d0217d65fd977bc34224bd5ad0180c250146684d` |
| 20261113090535 | map_verified_streamvista_studio_owner_20261113 | 1844 | `bb501c00ecdb14e217155034a22a312c23491d37b66636846099cf9c21f1e03e` |
| 20261113090954 | bridge_title_organization_fk_20261113 | 588 | `66af8ef69caa4f966f7380be5e72379a4abc478e1915baea68659709e546ba68` |
| 20261114074642 | bridge_dit_ingest_20261114 | 3839 | `eb287c589ce7f7ff344fa82c3b1600cc72bb00d086a54ee1655959d38b577294` |
| 20261114091812 | harden_bridge_private_storage_and_rls_helpers_20261114 | 3583 | `8428298296aff6bf2de3003893f09cdd7174209188edd77eb092a81ad153fc0a` |
| 20261114093249 | hostinger_inbound_mail_events_20261114 | 1377 | `366299a45d86ea48b05dc211ebc6c22e7b7b39bf1e2277c1883c957db2015e6d` |
| 20261114093357 | bridge_site_content_cms_20261114 | 1102 | `b6b366498c674b0c602e7a25b017bc5ea2ff1845f840092027ce92c43e84a5f8` |
| 20261114135434 | bridge_dit_storage_objects_20261114 | 1845 | `4a8e8b34f68ed48c3452ae9ec439bb10922da41c58c6992fcdaece0c362da96c` |
| 20261114135437 | bridge_delivery_job_ownership_20261114 | 650 | `c6526971459ae8b28866539df7e00d12bc5b846f72f6cce333b7d89aaa6ae63b` |
| 20261114135439 | bridge_multilingual_rights_packages_20261114 | 4105 | `666b283e9e2a03f34ca7b68f5eb44c57aada2c3f4fbc9941e38f938462f654f9` |
| 20261114135443 | bridge_notification_outbox_20261114 | 1115 | `63a3d2331c6a32de35ed67396d46ac63523054a96bf29c74736ebb6be4511f00` |
| 20261115164250 | bridge_production_documents | 3686 | `857e4fd12235104dae5384f1edf1d9cfeb19d9c46539a7831f87eba3dd5fa0cb` |
| 20261115164711 | bridge_production_owner_rls_helper | 1690 | `c304e0569da1b2909b1373f0b6920bbae1fc8c9a45da54be0d01e008e62ffa0a` |
| 20261115165233 | bridge_production_owner_helper_revoke_anon | 155 | `d4a980b33b895324231304f17fbaf912043d5659c6cf43e78421a00ed568a71e` |
| 20261116090923 | bridge_title_owner_helper_search_path_hardening_20261116 | 824 | `486eba102805b78a28a4509466eecab3f2557cb4093dac20d619f51c6a946fba` |
| 20261118123335 | bridge_master_language | 459 | `3a22cd57e41d7b0cbf0a40489c9b448981a9540bec672b0be34768213fc6b53c` |
| 20261123015009 | bridge_owner_submission_production_rollout | 15036 | `a290637b540db3dcd9891db5895f33ef996032c845023a16dd4abc89f7ea121a` |

## Previously committed files

All 17 files previously under `supabase/migrations/` are preserved byte-for-byte under `supabase/migrations_archive_unreconciled_20261116/`.

Ten existing SQL files matched a Production ledger statement but used a different timestamped filename:

| Former file | Restored Production migration |
|---|---|
| `20261006230000_bridge_commercial_engine.sql` | `20261006185556_bridge_commercial_engine_20261006230000.sql` |
| `20261007000000_harden_bridge_commercial_server_only.sql` | `20261006185640_harden_bridge_commercial_server_only_20261007000000.sql` |
| `20261007013000_bridge_commercial_control_plane.sql` | `20261006195531_bridge_commercial_control_plane_20261007013000.sql` |
| `20261007020000_bridge_financial_reversal_hardening.sql` | `20261006195536_bridge_financial_reversal_hardening_20261007020000.sql` |
| `20261007023000_bridge_commercial_performance_indexes.sql` | `20261006195607_bridge_commercial_performance_indexes_20261007023000.sql` |
| `20261114150000_bridge_site_content_cms.sql` | `20261114093357_bridge_site_content_cms_20261114.sql` |
| `20261114160000_bridge_dit_storage_objects.sql` | `20261114135434_bridge_dit_storage_objects_20261114.sql` |
| `20261114170000_bridge_delivery_job_ownership.sql` | `20261114135437_bridge_delivery_job_ownership_20261114.sql` |
| `20261114180000_bridge_multilingual_rights_and_packages.sql` | `20261114135439_bridge_multilingual_rights_packages_20261114.sql` |
| `20261114190000_bridge_notification_outbox.sql` | `20261114135443_bridge_notification_outbox_20261114.sql` |

Seven files did not match a Production ledger statement and remain archived for separate review:

- `20260921_crayons_bridge_rls.sql`
- `20261004_bridge_assets_add_censor_certificate.sql`
- `20261006170000_reconcile_duplicate_bridge_titles.sql`
- `20261006230000_duplicate_title_reconciliation.sql`
- `20261027_story_concept_submission.sql`
- `20261115220000_bridge_production_documents.sql`
- `20261115221000_bridge_production_owner_rls_helper.sql`

## Safety and verification

- The archive folder is outside Supabase CLI's default migration directory; archived SQL is not auto-run.
- `20261113090535_map_verified_streamvista_studio_owner_20261113` requires exactly one verified, unmapped Studio profile. A clean environment must provide that fixture before replay, or handle this one-time Production mapping separately.
- After merge, compare local and remote versions using `supabase migration list` and validate a complete replay on a disposable/staging database before any `db push` or `migration repair`.
- The historical reconciliation did not modify Production. The separate post-snapshot rollout migration was applied after Testing validation; it adds lifecycle schema only. No title, asset, rights, payment, entitlement, mail, or OCI data rows were changed.

## Verified pre-ledger baseline fixtures used only for local replay

Production contains six pre-ledger tables that are not created by any of the 69 recorded ledger statements, but are referenced by later historical migrations. Their empty schemas are recreated **only inside the disposable local Supabase CI database** before the respective historical migration is replayed:

- `public.loop_parental_controls`: exact Production columns, UUID primary key/FK to `auth.users`, 0–5 failed-attempt check, `locked_until` index, RLS enabled. The replay runner also recreates the verified updated-at trigger function and trigger. Its deny policy is deliberately left to migration `20261006231321`.
- `public.bridge_creator_notifications`: exact Production columns, `bigserial` primary key, status check, RLS enabled; no rows and no policy before the historical deep-clean migration.
- `public.loop_media_migration_queue`: exact Production columns, primary/unique constraints and enum checks, RLS enabled; no rows and no policy before the historical deep-clean migration.

- `public.bridge_story_concept_submissions`: exact Production columns, UUID primary key, unique title FK, curation-state check/index, RLS with the verified anonymous-deny and authenticated-owner policies. Production has three rows; none are copied into CI.
- `public.bridge_buyer_interest`: exact Production columns, UUID primary key, submission FK, interest-state check/index, RLS enabled with no client policies. Production has zero rows; none are copied into CI.

The replay runner recreates all six empty pre-ledger table schemas and their verified baseline access settings only in the fresh local database; it inserts no live data and uses no remote Supabase credentials. The local stack uses dedicated Postgres/API ports 55432/55431 to avoid collisions with parallel CI jobs. It validates RLS and the exact expected policies on all six tables: `deny_client_access` on the three server-only tables, both verified policies on `bridge_story_concept_submissions`, no client policies on `bridge_buyer_interest`, and the internal-only `bridge_delivery_jobs` policy. These fixtures do not create a new Production migration and do not change the Production schema.
