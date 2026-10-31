# Canonical Staging privilege review — repair proposal (DRAFT ONLY)

**Status:** Documentation-only review draft. Not executable. Not approved for application.  
**Environment in scope:** Supabase Staging `jbymleftneggcgutlcqu` only.  
**Repository baseline:** `main` at `2123a9983e6ef9c105d77824958cd9b784babb43` (31 Oct 2026 audit).  
**Production:** HOLD / NOT CERTIFIED / NO-GO.

## Safety boundary

This document is a proposal for review, not an implementation instruction. It contains no SQL migration and must not be applied as-is.

No database permissions, default privileges, RLS, policies, schemas, data, identities, environment variables, or deployments are changed by this document. No Production target is in scope. Any future SQL must be prepared as a separate, reviewed, Staging-only change after all dependencies and exact object inventories are verified.

## Executive findings

1. The Staging public schema contains 32 tables; all 32 were reported with RLS enabled.
2. The prior read-only privilege inspection found broad table privileges for both `anon` and `authenticated` on 17 tables.
3. The other 15 tables were not in that 17-object broad-DML result. Their full ACLs, column privileges, sequence privileges, inherited grants, and effective access still require a complete object-by-object verification before any repair.
4. Current `postgres` default privileges in `public` include broad table privileges for `anon` and `authenticated`, and broad sequence defaults. This creates a prospective risk for newly created objects owned by that role.
5. The ledger does not contain matching records for migrations 0008, 0012, or 0013. This does not prove those statements were never run manually; historical audit evidence is incomplete.
6. Migration 0008 references two relations absent from this Staging inventory: `bridge_loop_identity_links` and `bridge_loop_publications`.
7. Migration 0012 depends on identity and buyer-access relations and defines authenticated SELECT policies. Its assumptions do not match the current Staging inventory/policy state.
8. Migration 0013 revokes direct EXECUTE on four helper functions from browser roles. Its order and interaction with any RLS policy design must be reviewed with 0012; neither migration should be run independently.

## 32-table privilege matrix

Interpretation:
- **Broad ACL observed** means the earlier catalog check reported table-level privileges for both `anon` and `authenticated` across SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER.
- **No broad DML in prior result** means the object was not among the 17 broad-DML tables in the prior read-only count. It is not a certification that every privilege is absent.
- The exact per-object ACL must be re-read immediately before any future repair proposal is approved.

| # | Public table | Prior ACL result | RLS |
|---:|---|---|---|
| 1 | `bridge_profiles` | Broad ACL observed for anon + authenticated | Enabled |
| 2 | `bridge_titles` | Broad ACL observed for anon + authenticated | Enabled |
| 3 | `bridge_title_events` | Broad ACL observed for anon + authenticated | Enabled |
| 4 | `bridge_assets` | Broad ACL observed for anon + authenticated | Enabled |
| 5 | `bridge_payments` | Broad ACL observed for anon + authenticated | Enabled |
| 6 | `bridge_webhook_events` | Broad ACL observed for anon + authenticated | Enabled |
| 7 | `bridge_entitlements` | Broad ACL observed for anon + authenticated | Enabled |
| 8 | `bridge_audit_logs` | Broad ACL observed for anon + authenticated | Enabled |
| 9 | `bridge_email_challenges` | Broad ACL observed for anon + authenticated | Enabled |
| 10 | `bridge_invites` | Broad ACL observed for anon + authenticated | Enabled |
| 11 | `bridge_service_catalog` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 12 | `bridge_service_rates` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 13 | `bridge_tax_rates` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 14 | `bridge_service_quotes` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 15 | `bridge_service_quote_lines` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 16 | `bridge_service_orders` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 17 | `bridge_service_order_events` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 18 | `bridge_service_invoices` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 19 | `bridge_financial_ledger` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 20 | `bridge_title_duplicate_reviews` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 21 | `bridge_title_reconciliation_snapshots` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 22 | `bridge_title_reconciliation_events` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 23 | `bridge_service_costs` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 24 | `bridge_service_settlement_rules` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 25 | `bridge_service_settlement_lines` | No broad DML in prior result; exact ACL recheck required | Enabled |
| 26 | `bridge_story_concept_submissions` | Broad ACL observed for anon + authenticated | Enabled |
| 27 | `bridge_buyer_interest` | Broad ACL observed for anon + authenticated | Enabled |
| 28 | `bridge_asset_versions` | Broad ACL observed for anon + authenticated | Enabled |
| 29 | `bridge_qc_cases` | Broad ACL observed for anon + authenticated | Enabled |
| 30 | `bridge_legal_cases` | Broad ACL observed for anon + authenticated | Enabled |
| 31 | `bridge_rights_grants` | Broad ACL observed for anon + authenticated | Enabled |
| 32 | `bridge_destination_packages` | Broad ACL observed for anon + authenticated | Enabled |

## Migration dependency review

### 0008 — Data API lockdown

Source: `migrations/0008_bridge_data_api_lockdown.sql`

- States that Bridge operational access is server-authoritative (Better Auth + server-side RBAC + server PostgreSQL connection).
- Revokes browser-role table privileges on 12 named operational/identity/publication tables.
- Two referenced relations are absent from the current Staging 32-table inventory: `bridge_loop_identity_links`, `bridge_loop_publications`.
- **Do not apply unchanged** until relation ownership, intended schema, creation source, and dependency ordering are verified.

### 0012 — RLS identity binding

Source: `migrations/0012_bridge_rls_identity_binding.sql`

- Defines `bridge_current_user_id()`, `bridge_current_internal_role()`, `bridge_is_internal()`, and `bridge_can_read_title(text)`.
- Depends on identity/profile mapping and buyer-title access relations.
- Defines authenticated SELECT policies on selected tables.
- Current Staging advisor previously reported 32 RLS-enabled tables and zero public policies; the four helper functions and required identity/publication objects were reported missing in the prior audit.
- The source grants `authenticated` EXECUTE on the helpers because the policies call them. The later 0013 revokes that same EXECUTE permission. This means the authenticated policy path and 0013's direct-RPC hardening cannot be assumed to work together.
- **Do not apply** until the project chooses either a server-only Data API boundary (consistent with 0008, with no browser RLS read surface required) or a narrowly scoped browser-read design with a tested helper permission strategy.

### 0013 — Helper hardening

Source: `migrations/0013_harden_bridge_rls_helpers.sql`

- Revokes direct EXECUTE from PUBLIC, anon, and authenticated on the four helper functions.
- Requires the helper functions to exist first.
- The migration comment says RLS policies may invoke these helpers while API clients must not call them directly. However, PostgreSQL still requires the querying role to have EXECUTE privilege when a policy expression invokes a function. Revoking authenticated EXECUTE therefore conflicts with 0012's authenticated policies unless the policy execution model is redesigned and tested.
- **Do not apply independently or reorder speculatively.**

## Application access model — proposed, pending complete code review

The inspected application code indicates server-side PostgreSQL access through `getSql()` and server-side session/role checks. The intended default should therefore be:

- `anon`: no direct access to Bridge operational tables.
- `authenticated`: no direct operational-table access unless a narrowly scoped, separately approved and tested browser-read use case is documented.
- `service_role`: only the server-side privileges actually required; never expose its key to a browser.
- `postgres`: retain ownership; do not alter unrelated platform-owned objects or roles.
- Default privileges: future application tables should not automatically inherit broad browser-role privileges. Exact owner/schema/object scope must be proven before a separate change is proposed.

This is a proposed access model, not a statement that the current database already enforces it.

## Proposed work packages — no SQL included

| Priority | Review package | Required evidence before implementation |
|---|---|---|
| P0 | Default ACL remediation design | Owner-by-owner, schema-by-schema defaults; object types; platform ownership boundary; migration execution role |
| P0 | Existing 17-table ACL remediation design | Exact ACL including grantor/grant option, inherited roles, column ACLs, sequences, views, functions |
| P1 | 0008 dependency resolution | Source migrations and intended definitions for identity-link/publication tables; verified prerequisites |
| P1 | 0012 identity/RLS design | Verified auth-to-Bridge identity mapping, helper definitions, policy-by-policy access tests |
| P1 | 0013 function hardening | Exact function signatures/owners/ACLs and tested policy evaluation behavior |
| P2 | Buyer Interest and Story Concept | Route-by-route server/browser access map and role matrix |
| P2 | Sensitive data inventory | Live column list, column grants, view exposure, API exposure test plan |
| P2 | Sequence/function/view inventory | Effective privileges for anon/authenticated/service_role and default ACL implications |

## Mandatory pre-implementation gates

1. Re-query all 32 table ACLs and capture exact grants, grantors, grant options, owners, RLS and FORCE RLS.
2. Enumerate every public sequence, view, materialized view, function, and column-level grant.
3. Enumerate role membership/inheritance and effective privileges, not only direct ACL strings.
4. Confirm migration ledger and compare all source migrations in dependency order.
5. Identify the intended Staging database migration owner and distinguish Supabase-managed defaults from project-created defaults.
6. Review application routes and server-side query paths for all 32 tables.
7. Prepare a separate Staging-only SQL draft with explicit preconditions, postconditions, rollback strategy, and verification queries.
8. Obtain explicit approval before applying any SQL. Production remains out of scope.

## Non-goals / prohibited in this draft

- No Production changes.
- No migration execution.
- No GRANT, REVOKE, ALTER DEFAULT PRIVILEGES, DDL, RLS, or policy changes.
- No table/column/data deletion or mutation.
- No identity linking, role changes, environment-variable changes, or deployments.
- No automatic merge or production promotion.

## Current release posture

**Production: HOLD / NOT CERTIFIED / NO-GO.**

**Staging: security review in progress; repair not authorized and not applied.**


## Read-only verification addendum — 31 Oct 2026

This addendum records follow-up catalog checks against canonical Staging `jbymleftneggcgutlcqu`. These were SELECT/catalog-only checks. No database state was changed.

### Sequences

Exactly five public sequences were returned. All are owned by `postgres`, and all three sequence privileges (USAGE, SELECT, UPDATE) are effectively true for both `anon` and `authenticated`:

| Sequence | Owner | anon | authenticated | service_role |
|---|---|---|---|---|
| `bridge_audit_logs_id_seq` | postgres | USAGE/SELECT/UPDATE | USAGE/SELECT/UPDATE | USAGE/SELECT/UPDATE |
| `bridge_entitlements_id_seq` | postgres | USAGE/SELECT/UPDATE | USAGE/SELECT/UPDATE | USAGE/SELECT/UPDATE |
| `bridge_service_order_events_id_seq` | postgres | USAGE/SELECT/UPDATE | USAGE/SELECT/UPDATE | USAGE/SELECT/UPDATE |
| `bridge_title_events_id_seq` | postgres | USAGE/SELECT/UPDATE | USAGE/SELECT/UPDATE | USAGE/SELECT/UPDATE |
| `bridge_title_reconciliation_events_id_seq` | postgres | USAGE/SELECT/UPDATE | USAGE/SELECT/UPDATE | USAGE/SELECT/UPDATE |

The sequence ACL strings explicitly include `anon=rwU` and `authenticated=rwU`. This is a confirmed additional browser-role privilege exposure surface, separate from table ACLs.

### Functions

The current Staging `public` schema returned two functions:

| Function | Owner | anon EXECUTE | authenticated EXECUTE | service_role EXECUTE |
|---|---|---:|---:|---:|
| `bridge_duplicate_title_loop_release_allowed(text)` | postgres | No | No | Yes |
| `bridge_service_margin_paise(uuid)` | postgres | No | No | Yes |

The four helper functions defined by migration 0012 are absent from the live Staging function inventory. The two existing functions have restricted ACLs and do not exhibit the broad EXECUTE pattern.

### Views and other relation types

The catalog query returned **zero** public views, materialized views, and foreign tables. This is a current catalog result, not a statement about other schemas.

### Default ACL — owner/schema/object breakdown

The live `pg_default_acl` inventory includes:

- `postgres` in `public`: broad defaults for tables, sequences, and functions, including anon/authenticated table DML, sequence USAGE/SELECT/UPDATE, and function EXECUTE.
- `postgres` in `storage`: similar broad defaults are present.
- `supabase_admin` in `public`, `graphql`, and `graphql_public`: broad defaults also appear.
- `supabase_admin` in `extensions`: a different default ACL pattern is present.
- `supabase_admin` in `realtime` and `supabase_auth_admin` in `auth`: platform-specific defaults are present.

**Important ownership boundary:** Catalog output alone does not establish whether a default ACL was installed by Supabase platform provisioning or by a project operator. Do not modify `supabase_admin`, `supabase_auth_admin`, `storage`, `graphql`, `graphql_public`, `realtime`, `auth`, or `extensions` defaults as part of a Bridge repair. Even the `postgres/public` default ACL must not be altered until its provenance and intended migration owner are confirmed with Supabase support or authoritative audit evidence.

### Role membership / inheritance

The membership catalog shows `authenticator` is a member of `anon`, `authenticated`, and `service_role`; `postgres` has admin-option memberships across those roles. `supabase_realtime_admin` is also a member of those API roles. This is a role-membership fact, not proof that every application request inherits all privileges. Continue using effective-privilege checks for each object and request role; do not change platform role memberships.

### Revised 0012 / 0013 design conclusion

The SQL source confirms the conflict precisely:

1. 0012 creates the four SECURITY DEFINER helper functions.
2. 0012 grants EXECUTE to `authenticated` on all four.
3. 0012 creates authenticated SELECT policies that invoke those helpers.
4. 0013 revokes EXECUTE from `PUBLIC`, `anon`, and `authenticated` on those same four functions.

A caller evaluating a policy expression that invokes a function must have permission to execute that function. The SECURITY DEFINER property controls the privileges used inside the function body; it does not eliminate the caller's EXECUTE privilege requirement.

**Decision required before any migration design:**
- **Option A — server-only Bridge Data API (recommended based on 0008 and current app code):** Keep operational tables inaccessible to browser roles. Do not create a browser RLS read surface; 0012's policies are not needed for this model and should not be applied as a partial migration. Server-side authorization remains in the application/database connection path.
- **Option B — explicitly approved browser-read surface:** Define exactly which tables and roles may read, then redesign and test the helper execution strategy. Do not simply apply 0012 then 0013; the current sequence is contradictory for policy execution.

No choice has been implemented. Option A is a design recommendation only, pending application-owner approval.

### Updated completion status

| Review item | Result |
|---|---|
| Five public sequence ACLs | Verified; broad anon/authenticated privileges |
| Public functions | Two present; service_role-only EXECUTE |
| 0012 helper functions | Four absent |
| Public views/materialized views/foreign tables | Zero found |
| Default ACL owner/schema breakdown | Verified; provenance unknown |
| Platform-owned default ACL boundary | Must remain untouched |
| Role memberships | Catalog verified; effective privileges still assessed per object |
| 0012/0013 conflict | Confirmed from exact source SQL |
| Repair SQL | Not written or applied |

**No GRANT, REVOKE, ALTER DEFAULT PRIVILEGES, DDL, RLS/policy change, migration, deployment, or Production operation was performed.**
