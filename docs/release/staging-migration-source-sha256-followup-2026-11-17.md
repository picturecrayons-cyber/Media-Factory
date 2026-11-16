# STAGING migration SQL source and SHA-256 follow-up — 2026-11-17

## Result

**BLOCKED — SOURCE FILES NOT LOCATED; NO SHA-256 RECONCILIATION POSSIBLE YET.**

A fresh Supabase migration listing confirms 55 recorded versions in STAGING project `jbymleftneggcgutlcqu`. The ledger exposes version/name metadata, not the original SQL statement bytes. A hash of a migration name or reconstructed SQL would not prove source integrity and is deliberately not substituted.

## Repository source search performed

Read-only GitHub inspection of `picturecrayons-cyber/Media-Factory` and `picturecrayons-cyber/crayons-loop-streaming-platform` searched for representative STAGING migration names:
- `test_only_bridge_core_baseline_20261028`
- `bridge_testing_workspace_rls_20261106`
- `loop_runtime_tables_and_atomic_tvod_fulfillment_staging`
- `restrict_public_loop_catalog_rpc_to_edge_service_testing`

No matching migration SQL files were returned by repository code search. Direct fetch attempts for representative expected paths on the inspected branches returned NOT_FOUND. The active `Media-Factory/supabase/migrations/` directory and its 69-entry manifest are the recovered **Production** migration source set, not the 55-entry STAGING test ledger. The archived 17 files are explicitly not a verified source for those 55 STAGING entries.

## Correct interpretation of the prior ledger comparison

The prior 0/69 version overlap is a comparison between two independently versioned histories. It is **not** proof that STAGING is missing 69 migrations, and it is not a valid target-state parity test. STAGING's `test_only_*` and `*_testing` migration names identify a separate test lineage. The correct next comparison is STAGING ledger ↔ exact STAGING migration source ↔ current STAGING catalog / intended STAGING contract.

## Evidence matrix

| Check | Status |
|---|---|
| STAGING project identity and PostgreSQL version | PASS |
| STAGING migration ledger metadata (55 entries) | PASS |
| STAGING migration SQL source bodies retrieved | BLOCKED |
| Exact byte counts for STAGING SQL bodies | BLOCKED |
| SHA-256 for STAGING SQL bodies | BLOCKED |
| Source commit/branch pinned for all 55 entries | BLOCKED |
| Semantic migration-to-catalog comparison | BLOCKED |
| Production migration set treated as STAGING source | PROHIBITED |

## Required source recovery

The engineering workflow must locate the exact repository, branch, commit, artifact, or deployment bundle that originally supplied these 55 SQL bodies. For each ledger entry, capture:
- exact source path and immutable commit/object reference;
- exact SQL bytes without newline or whitespace normalization;
- byte count and SHA-256 computed from those exact bytes;
- matching ledger version and recorded name;
- independent verification of source-to-ledger mapping.

If an applied migration's source cannot be recovered, mark that entry **SOURCE UNRECOVERABLE** and reconstruct intent only as a separately reviewed forensic artifact; never fabricate a matching hash.

## Environment / safety boundary

| Environment | Action | Access | Risk |
|---|---|---|---|
| STAGING DB `jbymleftneggcgutlcqu` | No additional database operation in this follow-up | READ-ONLY | Low |
| PRODUCTION DB `mlmgugivsyoxzdgwkbpu` | No action | READ-ONLY / HOLD | High |

No SQL execution, DB write, migration push/repair, grant/policy change, Auth operation, Data API request, payment action, merge, deployment, or OCI change occurred. ₹0.

**Gate remains BLOCKED.** Do not apply, repair, rename, or replay migrations in either hosted database. PRODUCTION remains HOLD / NOT CERTIFIED / NO-GO.
