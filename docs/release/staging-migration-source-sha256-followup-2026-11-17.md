# STAGING migration SQL source and SHA-256 follow-up — 2026-11-17

## Result

**PARTIAL PASS — 55/55 APPLIED SQL BODIES PRESERVED/READABLE; ORIGINAL SOURCE-FILE RECONCILIATION REMAINS BLOCKED FOR 44 RECORDS.**

STAGING project `jbymleftneggcgutlcqu` has 55 migration ledger entries. Evidence in prior PR #516 covers the first 28 entries: 10 exact repository source-file matches, 1 whitespace/newline-normalized match, and 17 applied SQL bodies preserved in a non-executable text archive. A separate archive preserves 3 subsequent applied SQL bodies. Read-only SQL retrieval recovered the later 24 applied statements.

This corrects the earlier overbroad statement that no SQL bodies were available. All 55 applied SQL bodies are available as evidence; however, only 11 have a repository source-file match recorded (10 exact and 1 normalized). The remaining 44 have preserved/retrieved applied SQL text but do not yet have verified original source-file/commit mappings.

## Later 24 — ledger statement fingerprints

For each of the following records, a read-only query confirmed one statement and captured serialized statement byte count and SHA-256 over UTF-8 `array_to_string(statements, E'\\n')`. These are **ledger-statement serialization fingerprints**, not hashes of recovered original migration-file bytes and not proof of source-file equality.

| Version | Recorded name | Bytes | Ledger statement SHA-256 |
|---|---|---:|---|
| 20261110183356 | staging_bridge_role_rpc_and_multi_studio_membership | 1007 | 17151a8cb651f27f0604a10488057bd0ef3ca02e4fc6f03b50bc77e87d216186 |
| 20261110183454 | loop_runtime_tables_and_atomic_tvod_fulfillment_staging | 13193 | 61a2f99019512a0ba60812cba50e4c4d4c320d75f86a4983bdfe9ed5fc1cb435 |
| 20261110183528 | staging_server_only_deny_policies_and_loop_minimum_grants | 1434 | 661bc61e4b2b07a48e9943e76b971e72eb3a9fc2a740e136b7f1733647ffe2fd |
| 20261110183943 | loop_watch_progress_authenticated_own_rows_only | 819 | 1942cdebbe8587d7c0b73a1033beac9a09c7e5cb292594dcc49d88d51fc767ac |
| 20261110184842 | bridge_multi_studio_membership_lookup_index | 304 | 92ac4d88673b9c5b043a4573d6cd47a2c1dc8d9ab92853df43731397aacce302 |
| 20261110193739 | bridge_rights_evidence_verification_0021_staging | 10983 | bff7997f1b429492cf9d5e1ef8d9a99807d205b99bd72c01693b487149b8930b |
| 20261111100344 | loop_public_catalog_rpc | 2238 | 391d78a3f6c7787f36524f8a94a1ffc22cbf1dd7bd02d55b0a3643a4b406a071 |
| 20261111100648 | loop_tvod_entitlement_rpc | 657 | 18d6f518f8be8c2c96a2fcb27a7b92b4eded98139f6a74fe9055e746fe70663f |
| 20261111101656 | 20261111101500_loop_public_catalog_and_tvod_entitlement_rpc | 3151 | 3d94bf92b932bea2a06ac087fd5c3505117014776f895083a4e9b51e02f5ac88 |
| 20261111101742 | loop_rental_fulfillment_readiness | 796 | 3f87b55a1743bab735cae955817004ebdd278ed2a01be5e4d8a5a70a384f0ce4 |
| 20261111102654 | 20261111102000_loop_rental_fulfillment_readiness | 708 | 73c06e643a4f56db9d194521f6e171986ae9ea3bef110ad970b6167d916d3719 |
| 20261111110755 | streamvista_customer_intake | 6125 | ec47e78b91b6d2edebb2c7a0f6d464ccae29e5c91981c2408fdb380b1e682b69 |
| 20261111111042 | streamvista_private_project_storage | 1946 | 44e1af1c81b5d8cb54ed9c3d1a2e29dd9ea2a249839507a934722c14ebd6f60e |
| 20261111163440 | buyer_acquisition_mandate_legal_scope_20261111 | 4777 | 1b43f7b3dce7bb2ee18de3416ff499cea9175b01d832e197dceed4af2e31ee83 |
| 20261111163555 | buyer_organization_legal_verification_20261111 | 3937 | 2060bb8562913cb726feecb6963cf8fc0a698b11e7463b2a5f902a8ac6a5b217 |
| 20261114075718 | bridge_dit_ingest_testing_20261114 | 3839 | eb287c589ce7f7ff344fa82c3b1600cc72bb00d086a54ee1655959d38b577294 |
| 20261114093221 | bridge_site_content_cms_20261114 | 1102 | b6b366498c674b0c602e7a25b017bc5ea2ff1845f840092027ce92c43e84a5f8 |
| 20261116082227 | 20261115220000_bridge_production_documents | 3708 | 0f2c7096374587ee4c2a4c03ce6874c66ccc9dec86b22e46012216c982023aa5 |
| 20261116082234 | 20261115221000_bridge_production_owner_rls_helper | 1945 | 3afde622760e4cb3049277082c28185f309a5ba458e2378ca6a0b9f0763ac7b2 |
| 20261116082236 | 20261116083000_harden_bridge_title_owner_helper | 1014 | a9cb95d944e7b98825be2094e0d2bdee00abe163aad2999ab5ba70e2633a0498 |
| 20261116111314 | secure_public_loop_catalog_testing | 2275 | 87df8348d4791d070200d9c8e3f5b39453267b2be9d68b43fb30d331acbbc044 |
| 20261116111344 | grant_public_loop_catalog_invoker_reads_testing | 196 | f74ae90e08c58565bf3ba3083e7e6cf2e67475393d02acbaf1f2405ae9821b45 |
| 20261116111454 | normalize_public_loop_catalog_schema_testing | 3240 | 0743fbf6a6b87f7121d1550a51f74c5e1728663169e2769195c79a25408002fc |
| 20261116111631 | restrict_public_loop_catalog_rpc_to_edge_service_testing | 364 | 87caf56dc37f236e3374b9d41e9b4ef2e37a35fcca7eec01a4babd54bf9e8e65 |

## Repository source lineage

- PR #516 records 10 exact source-file matches and 1 whitespace/newline-normalized match for the initial 28 entries; 17 further applied bodies are preserved in a non-executable archive.
- The three 2026-11-09 orphaned applied bodies are preserved in a separate non-executable archive.
- The Loop branch `fix/staging-loop-runtime-compat-20261111` contains candidate files for three Loop migrations, but exact byte-for-byte matching against ledger statements has not been certified.
- The active Bridge `supabase/migrations/` set and its 69-entry manifest are a **Production** source set. They are not an acceptable substitute for STAGING's 55-entry test lineage.

## Correct interpretation

The prior 0/69 version overlap compares two independently versioned histories. It does not mean STAGING is missing 69 Production migrations and does not prove schema divergence. The correct target is STAGING ledger ↔ original STAGING migration source ↔ current STAGING catalog ↔ intended STAGING contract.

## Evidence matrix

| Check | Status |
|---|---|
| STAGING ledger metadata | PASS — 55 entries |
| Applied SQL bodies preserved/retrieved | PASS — 55/55 |
| Prior repository source mapping | PARTIAL PASS — 10 exact + 1 normalized |
| Applied SQL body archives for 20 records | PASS — non-executable evidence only |
| Later 24 ledger statement byte counts and serialization hashes | PASS — fingerprints recorded above |
| Original source commit/file pinned for all 55 | BLOCKED — 44 mappings remain unverified |
| Intended STAGING schema contract pinned | BLOCKED |
| Semantic migration-to-catalog comparison | BLOCKED |
| Disposable replay of exact STAGING source | NOT RUN |
| Independent human security review | PENDING |

## Required next work

1. Reconcile each of the 44 entries without exact source-file mapping to its original repository, branch, commit, artifact, or deployment bundle.
2. For each located original SQL file, compute SHA-256 over exact file bytes without normalization and compare against the corresponding applied statement using a documented extraction/serialization method.
3. Mark genuinely unrecoverable source as **SOURCE UNRECOVERABLE**; do not fabricate source hashes.
4. Pin the intended STAGING schema contract and perform a full catalog comparison.
5. Replay only a verified STAGING source set in a disposable local environment, never in either hosted DB.
6. Obtain independent human security review before requesting any STAGING write authorization.

## Environment and safety boundary

| Environment | Action | Access | Risk |
|---|---|---|---|
| STAGING DB `jbymleftneggcgutlcqu` | Read-only ledger and statement inspection only | READ-ONLY | Low; evidence snapshot can become stale |
| PRODUCTION DB `mlmgugivsyoxzdgwkbpu` | No action | READ-ONLY / HOLD | High |

No hosted SQL writes, migration push/repair, grants/policies, Auth changes, Data API calls, payment actions, merge, deployment, or OCI changes occurred. ₹0.

**Gate remains BLOCKED for original source lineage and semantic replay.** Do not apply, repair, rename, or replay migrations in either hosted database. PRODUCTION remains HOLD / NOT CERTIFIED / NO-GO.
