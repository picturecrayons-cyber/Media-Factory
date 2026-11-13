# Crayons Bridge — STAGING ACL Evidence Matrix

**Audit date:** 03 November 2026  
**Environment:** STAGING / TESTING DB `jbymleftneggcgutlcqu` only  
**PRODUCTION DB:** `mlmgugivsyoxzdgwkbpu` excluded; not queried  
**Mode:** Read-only evidence capture; no SQL writes or remediation applied  
**Review state:** Independent review required; STAGING NOT CERTIFIED

## 1. Table-by-table snapshot

Catalog query joins `pg_class`, `pg_namespace` and `information_schema.table_privileges`. All 32 listed relations are ordinary/partitioned public tables. Every row reports `relrowsecurity=true`, `relforcerowsecurity=false`, owner `postgres`, and no row-level policies in `pg_policies`.

The 17 tables below have direct table-level grants to **both** `anon` and `authenticated`. For each of those two grantees, the observed privilege set is:
`DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`.

| STAGING table | RLS | FORCE RLS | anon | authenticated |
|---|---:|---:|---|---|
| `bridge_asset_versions` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_assets` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_audit_logs` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_buyer_interest` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_destination_packages` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_email_challenges` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_entitlements` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_invites` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_legal_cases` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_payments` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_profiles` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_qc_cases` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_rights_grants` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_story_concept_submissions` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_title_events` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_titles` | ON | OFF | 7 privileges | 7 privileges |
| `bridge_webhook_events` | ON | OFF | 7 privileges | 7 privileges |

The other 15 tables below have no direct `anon` or `authenticated` table-level grants returned by this query. This does not imply they are fully inaccessible: inherited privileges, column grants, schema grants, function paths, ownership and service roles must also be considered.

| STAGING table | RLS | FORCE RLS | Direct anon/authenticated table grants |
|---|---:|---:|---|
| `bridge_financial_ledger` | ON | OFF | None returned |
| `bridge_service_catalog` | ON | OFF | None returned |
| `bridge_service_costs` | ON | OFF | None returned |
| `bridge_service_invoices` | ON | OFF | None returned |
| `bridge_service_order_events` | ON | OFF | None returned |
| `bridge_service_orders` | ON | OFF | None returned |
| `bridge_service_quote_lines` | ON | OFF | None returned |
| `bridge_service_quotes` | ON | OFF | None returned |
| `bridge_service_rates` | ON | OFF | None returned |
| `bridge_service_settlement_lines` | ON | OFF | None returned |
| `bridge_service_settlement_rules` | ON | OFF | None returned |
| `bridge_tax_rates` | ON | OFF | None returned |
| `bridge_title_duplicate_reviews` | ON | OFF | None returned |
| `bridge_title_reconciliation_events` | ON | OFF | None returned |
| `bridge_title_reconciliation_snapshots` | ON | OFF | None returned |

## 2. Aggregate evidence

| Control | Observed result |
|---|---|
| Public tables | 32 |
| RLS enabled | 32 / 32 |
| FORCE RLS | 0 / 32 |
| Public RLS policies | 0 |
| Direct table grants to anon | 17 tables |
| Direct table grants to authenticated | 17 tables |
| Direct table-level TRUNCATE grants | 17 tables for each grantee |
| Column-level grants | 197 columns per role in the catalog query |
| Public sequence USAGE | 5 sequences for each role |
| Default ACLs | Broad defaults recorded for postgres and supabase_admin; include table, sequence and function privileges for anon/authenticated |
| Table owners | postgres for all 32 |
| SECURITY DEFINER function | `bridge_duplicate_title_loop_release_allowed(text)`, owner postgres, search_path public; current EXECUTE ACL lists postgres and service_role only |
| Role bypass | postgres and service_role have BYPASSRLS; anon/authenticated do not |

**Interpretation:** Direct grants are a confirmed privilege-design failure requiring object-by-object remediation. RLS with no policies ordinarily denies row access through RLS-enforced queries, but it does not govern `TRUNCATE`. A grant alone does not prove an external request reached the object or that data was exfiltrated. No breach is asserted.

## 3. Object-specific follow-up still required

- Resolve column grants against table grants and inherited role membership; the 197-column count is not a separate set of 197 table exposures.
- Verify exact privileges per sequence, including `SELECT`, `USAGE`, `UPDATE`, ownership and dependencies.
- Expand function ACLs to effective PUBLIC/inherited grants; review all SECURITY DEFINER bodies, owners, search paths and exposed RPC reachability.
- Verify schema `USAGE` and `CREATE` ACLs.
- Confirm default ACLs for every actual object-creating/migration owner and which objects they affect.
- Inspect view/materialized view/foreign table exposure, triggers, policies in non-public schemas and grants to all inherited roles.
- Prove the deployed Preview database target and runtime DB role before any runtime tests.
- Classify every table as server-only, narrow browser read, browser write, internal-only, legacy/unused or unknown. Do not infer classification from table names alone.

## 4. Migration and identity dependency reconciliation

Current source proposal records these unresolved dependencies:

1. `0007a_identity_links.sql` references `public."user"(id)`; that relation was absent from the STAGING public table inventory.
2. `0008_bridge_data_api_lockdown.sql` depends on `bridge_loop_identity_links`.
3. `0009_buyer_title_access.sql` creates `bridge_buyer_title_access`, absent from the reviewed STAGING inventory.
4. `0012_bridge_rls_identity_binding.sql` depends on identity/buyer-access relations and references `bridge_loop_publications`, absent from the reviewed inventory.
5. `0021_bridge_organizations.sql` creates organization/membership relations absent from the reviewed inventory.
6. STAGING's 13 migration records do not prove source migration checksum parity.
7. `0012` helper EXECUTE grants and `0013` revokes must be reconciled with policy execution requirements before any helper/policy migration is considered.

**Gate:** No replay, schema repair, ACL change or policy creation until canonical identity authority, object definitions, migration checksums, owner roles, callsites and rollback requirements are independently reconciled.

## 5. Required remediation design

- No blanket revoke.
- No generic `authenticated` policy.
- No migration replay based solely on filename/history.
- No replay of `0006_loop_canonical.sql` into this Bridge STAGING database.
- Prepare exact per-object ACL and policy diffs with preconditions, blast-radius notes and inverse rollback.
- Preserve least privilege and existing business workflows; add positive and negative tests for buyer/creator isolation, internal roles, QC/legal/rights/finance boundaries, payments/webhooks, and confidential DIT/service costs.
- Obtain separate explicit approval before any STAGING DB write.
- Production remains HOLD / NOT CERTIFIED / NO-GO.

**No SQL, migration, grant, revoke, RLS, Auth, data, deployment or production change was made.**

Zero-regression: **App-inu pani kittaruthu.**
